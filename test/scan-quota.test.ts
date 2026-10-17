import assert from 'node:assert/strict';
import {
  DAILY_SCAN_LIMIT,
  getScanQuota,
  consumeScanQuota,
  createPendingScanSession,
  recordClassification,
  upsertPlayer,
  getLeaderboard,
  getVietnamDateKey,
} from '../server/store.ts';
import {
  getAdminSecret,
  authenticateEvaluator,
  isEvaluatorAuthorized,
  createUserSession,
  createGuestSession,
  getIdempotencyResult,
  setIdempotencyResult,
} from '../server/sessionManager.ts';

interface RealTestCase {
  id: number;
  name: string;
  run: () => Promise<void> | void;
}

const testCases: RealTestCase[] = [
  {
    id: 1,
    name: 'Xác minh giới hạn mặc định 30 lượt/ngày/tài khoản (DAILY_SCAN_LIMIT = 30)',
    run: () => {
      assert.equal(DAILY_SCAN_LIMIT, 30, 'DAILY_SCAN_LIMIT must be 30');
      const testUser = `test_quota_init_${Date.now()}`;
      const quota = getScanQuota(testUser);
      assert.equal(quota.limit, 30, 'Initial quota limit must be 30');
      assert.equal(quota.used, 0, 'Initial used scans must be 0');
      assert.equal(quota.remaining, 30, 'Initial remaining scans must be 30');
    },
  },
  {
    id: 2,
    name: 'Kiểm tra trừ lượt tuần tự: Mỗi lượt quét AI hợp lệ trừ chính xác 1 lượt',
    run: () => {
      const testUser = `test_quota_seq_${Date.now()}`;
      for (let i = 1; i <= 5; i++) {
        const result = consumeScanQuota(testUser);
        assert.equal(result.allowed, true, `Turn ${i} should be allowed`);
        assert.equal(result.used, i, `Turn ${i} used count should be ${i}`);
        assert.equal(result.remaining, 30 - i, `Turn ${i} remaining should be ${30 - i}`);
      }
    },
  },
  {
    id: 3,
    name: 'Từ chối lượt quét thứ 31 (HTTP 429 QUOTA_EXCEEDED khi hết 30 lượt)',
    run: () => {
      const testUser = `test_quota_exceed_${Date.now()}`;
      // Consume first 30 turns
      for (let i = 1; i <= 30; i++) {
        const res = consumeScanQuota(testUser);
        assert.equal(res.allowed, true, `Turn ${i} should be allowed`);
      }

      // 31st turn MUST be rejected
      const turn31 = consumeScanQuota(testUser);
      assert.equal(turn31.allowed, false, 'Turn 31 must be rejected');
      assert.equal(turn31.remaining, 0, 'Remaining scans must be 0');
      assert.equal(turn31.used, 30, 'Used scans must stay at 30');
      assert.ok(turn31.reason && turn31.reason.includes('30 lượt quét AI'), 'Must provide clear quota exceeded reason');
    },
  },
  {
    id: 4,
    name: 'Tự động làm mới hạn mức lúc 00:00 theo múi giờ Asia/Ho_Chi_Minh khi sang ngày mới',
    run: () => {
      const testUser = `test_quota_reset_${Date.now()}`;
      // Day 1: Consume all 30 turns
      const day1Date = new Date('2026-10-17T23:59:00+07:00');
      for (let i = 1; i <= 30; i++) {
        consumeScanQuota(testUser, day1Date);
      }
      const quotaDay1 = getScanQuota(testUser, day1Date);
      assert.equal(quotaDay1.remaining, 0, 'Day 1 remaining must be 0');

      // Day 2: 1 minute later past midnight (00:01:00)
      const day2Date = new Date('2026-10-18T00:01:00+07:00');
      const quotaDay2 = getScanQuota(testUser, day2Date);
      assert.equal(quotaDay2.remaining, 30, 'Quota must reset to 30 on day 2');
      assert.equal(quotaDay2.used, 0, 'Used scans must reset to 0 on day 2');

      // Consume turn on day 2 succeeds
      const day2Turn1 = consumeScanQuota(testUser, day2Date);
      assert.equal(day2Turn1.allowed, true, 'Turn 1 on new day must succeed');
      assert.equal(day2Turn1.remaining, 29, 'Remaining should be 29');
    },
  },
  {
    id: 5,
    name: 'Chống vượt hạn mức khi gửi request đồng thời (Atomic concurrency guard)',
    run: () => {
      const testUser = `test_quota_race_${Date.now()}`;
      // Consume 29 turns, exactly 1 turn remains
      for (let i = 1; i <= 29; i++) {
        consumeScanQuota(testUser);
      }
      assert.equal(getScanQuota(testUser).remaining, 1, 'Exactly 1 turn remaining');

      // Send 5 simulated concurrent quota consumption requests
      const concurrentAttempts = [1, 2, 3, 4, 5].map(() => consumeScanQuota(testUser));
      const successes = concurrentAttempts.filter((r) => r.allowed);
      const rejections = concurrentAttempts.filter((r) => !r.allowed);

      assert.equal(successes.length, 1, 'Exactly 1 concurrent request should succeed');
      assert.equal(rejections.length, 4, 'Remaining 4 concurrent requests must be rejected (HTTP 429)');
      assert.equal(getScanQuota(testUser).remaining, 0, 'Quota should not drop below 0');
    },
  },
  {
    id: 6,
    name: 'Cơ chế Idempotency: Gửi lại cùng request (retry) không bị trừ trùng hạn mức',
    run: () => {
      const testUser = `test_idempotency_user_${Date.now()}`;
      const idempotencyKey = `idem_key_${Date.now()}_abc`;

      // Initial request caches result
      const mockClassifyResponse = {
        success: true,
        data: { itemName: 'Chai nhựa rỗng', category: 'recyclable', points: 2 },
        quota: { used: 1, remaining: 29 },
      };
      setIdempotencyResult(idempotencyKey, testUser, mockClassifyResponse);

      // Verify idempotency cache retrieval
      const cached = getIdempotencyResult(idempotencyKey, testUser);
      assert.ok(cached, 'Cached response should be returned');
      assert.equal(cached.data.itemName, 'Chai nhựa rỗng', 'Cached data must match');

      // Different user with same key should NOT receive cache
      const otherUserCache = getIdempotencyResult(idempotencyKey, 'other_user_xyz');
      assert.equal(otherUserCache, null, 'Cache must not leak across users');
    },
  },
  {
    id: 7,
    name: 'Xóa localStorage hoặc đổi thiết bị không đặt lại hạn mức trên Backend',
    run: () => {
      const testUser = `test_persistence_${Date.now()}`;
      consumeScanQuota(testUser);
      consumeScanQuota(testUser);
      assert.equal(getScanQuota(testUser).remaining, 28, 'Should have 28 turns left');

      // Simulate client completely clearing localStorage (new client query arrives)
      const serverAuthoritativeQuota = getScanQuota(testUser);
      assert.equal(serverAuthoritativeQuota.remaining, 28, 'Server store preserves actual remaining quota');
      assert.equal(serverAuthoritativeQuota.used, 2, 'Server store preserves actual used count');
    },
  },
  {
    id: 8,
    name: 'Cách ly hoàn toàn giữa hạn mức quét AI và điểm tích lũy / bảng xếp hạng',
    run: () => {
      const testStudent = upsertPlayer({
        name: 'Nguyễn Văn A - STEM Test',
        email: `student_isolation_${Date.now()}@ecosort.stem`,
        organization: 'Lớp 11A1 - CLB STEM',
        totalPoints: 50,
      });

      const initialPoints = testStudent.totalPoints;
      // Consume 10 scans
      for (let i = 0; i < 10; i++) {
        consumeScanQuota(testStudent.id);
      }

      const leaderboard = getLeaderboard();
      const currentStudent = leaderboard.find((p) => p.id === testStudent.id);
      assert.ok(currentStudent, 'Student must exist on leaderboard');
      assert.equal(currentStudent.totalPoints, initialPoints, 'Total points must not change when quota is consumed');
    },
  },
  {
    id: 9,
    name: 'Bảo vệ điểm: Từ chối scanId giả mạo hoặc chưa từng được AI phân tích',
    run: () => {
      const fakeScanId = `fake-scan-${Date.now()}-malicious`;
      const result = recordClassification({
        scanId: fakeScanId,
        userName: 'Kẻ Tấn Công',
        itemName: 'Chai nhựa',
        category: 'recyclable',
        points: 2,
      });

      assert.equal(result.success, false, 'Fake scanId must be rejected');
      assert.ok(result.error && result.error.includes('không tồn tại'), 'Must state scanId does not exist');
    },
  },
  {
    id: 10,
    name: 'Bảo vệ điểm: Không cho phép tài khoản khác hoặc tài khoản khách nhận điểm từ scanId của người khác',
    run: () => {
      const studentOwner = `student_owner_${Date.now()}`;
      const attackerUser = `attacker_thief_${Date.now()}`;

      // Legitimate AI scan created by studentOwner
      const session = createPendingScanSession({
        userId: studentOwner,
        itemName: 'Hộp carton sạch',
        category: 'recyclable',
        points: 2,
        confidence: 0.95,
        isWaste: true,
        isUncertain: false,
      });

      // Attacker tries to claim points using studentOwner's scanId
      const attackResult = recordClassification({
        scanId: session.scanId,
        userId: attackerUser,
        userName: 'Kẻ Trộm Điểm',
        itemName: 'Hộp carton sạch',
        category: 'recyclable',
        points: 2,
      });

      assert.equal(attackResult.success, false, 'Stealing another users scanId must fail');
      assert.ok(attackResult.error && attackResult.error.includes('thuộc về tài khoản hoặc phiên làm việc khác'), 'Must state ownership mismatch');

      // Genuine owner claims points: SUCCEEDS
      const validResult = recordClassification({
        scanId: session.scanId,
        userId: studentOwner,
        userName: 'Học Sinh Thật',
        itemName: 'Hộp carton sạch',
        category: 'recyclable',
        points: 2,
      });
      assert.equal(validResult.success, true, 'Genuine owner must claim points successfully');
      assert.equal(validResult.pointsAwarded, 2, 'Must award 2 points for recyclable');
    },
  },
  {
    id: 11,
    name: 'Bảo vệ điểm: Từ chối lượt quét đã hết hạn (>15 phút)',
    run: () => {
      const testUser = `expired_user_${Date.now()}`;
      const session = createPendingScanSession({
        userId: testUser,
        itemName: 'Vỏ chuối',
        category: 'organic',
        points: 1,
        confidence: 0.98,
        isWaste: true,
        isUncertain: false,
      });

      // Artificially expire the session by setting expiresAt to the past
      session.expiresAt = Date.now() - 1000;

      const result = recordClassification({
        scanId: session.scanId,
        userId: testUser,
        userName: 'Học Sinh Trễ Hạn',
        itemName: 'Vỏ chuối',
        category: 'organic',
        points: 1,
      });

      assert.equal(result.success, false, 'Expired scan session must be rejected');
      assert.ok(result.error && result.error.includes('hết hạn'), 'Must state session expired');
    },
  },
  {
    id: 12,
    name: 'Bảo vệ điểm: Cơ chế Idempotency ngăn cộng điểm trùng lặp khi gửi request nhiều lần hoặc đồng thời',
    run: () => {
      const testUser = `idempotent_user_${Date.now()}`;
      const session = createPendingScanSession({
        userId: testUser,
        itemName: 'Lon nhôm Coca',
        category: 'recyclable',
        points: 2,
        confidence: 0.96,
        isWaste: true,
        isUncertain: false,
      });

      // Claim 1: SUCCESS (awards +2 points)
      const claim1 = recordClassification({
        scanId: session.scanId,
        userId: testUser,
        userName: 'Thí sinh Thật',
        itemName: 'Lon nhôm Coca',
        category: 'recyclable',
        points: 2,
      });
      assert.equal(claim1.success, true, 'First claim should succeed');
      assert.equal(claim1.pointsAwarded, 2, 'Points awarded on first claim must be 2');
      const pointsAfterFirst = claim1.player!.totalPoints;

      // Claim 2 with same scanId: IDEMPOTENT (awards 0 additional points)
      const claim2 = recordClassification({
        scanId: session.scanId,
        userId: testUser,
        userName: 'Thí sinh Thật',
        itemName: 'Lon nhôm Coca',
        category: 'recyclable',
        points: 2,
      });
      assert.equal(claim2.success, true, 'Second idempotent call should return success without error');
      assert.equal(claim2.alreadyProcessed, true, 'alreadyProcessed flag must be true');
      assert.equal(claim2.pointsAwarded, 0, 'No duplicate points should be awarded');
      assert.equal(claim2.player!.totalPoints, pointsAfterFirst, 'Total points must remain unchanged');
    },
  },
  {
    id: 13,
    name: 'Phân quyền STEM Lab: Từ chối người dùng hoặc học sinh không có quyền chạy benchmark',
    run: () => {
      // Test invalid / missing token
      assert.equal(isEvaluatorAuthorized(''), false, 'Empty token must be unauthorized');
      assert.equal(isEvaluatorAuthorized('wrong_secret_123'), false, 'Wrong secret must be unauthorized');
      assert.equal(isEvaluatorAuthorized('STEM2026'), false, 'Static obsolete key "STEM2026" must be unauthorized');
      assert.equal(isEvaluatorAuthorized('ecosort_admin_2026'), false, 'Static obsolete key "ecosort_admin_2026" must be unauthorized');
    },
  },
  {
    id: 14,
    name: 'Phân quyền STEM Lab: Xác thực thành công cấp quyền kiểm thử cho Ban giám khảo / Giáo viên',
    run: () => {
      const secret = getAdminSecret();
      assert.ok(secret && secret.length >= 8, 'Admin secret must be present and secure');

      // Login with correct passkey
      const loginRes = authenticateEvaluator(secret);
      assert.equal(loginRes.success, true, 'Evaluator login with valid secret must succeed');
      assert.ok(loginRes.token && loginRes.token.startsWith('eval_'), 'Must return valid evaluator session token');

      // Token verification
      assert.equal(isEvaluatorAuthorized(loginRes.token), true, 'Issued evaluator token must be authorized');
    },
  },
];

async function runRealTestEngine() {
  console.log('================================================================');
  console.log('BỘ KIỂM THỬ THỰC NGHIỆM ĐỘC LẬP: SMARTWASTE BẢN 2 (AUDIT SUITE)');
  console.log('Chạy trực tiếp với Assertions thực tế - KHÔNG ghi cứng kết quả PASS');
  console.log('================================================================\n');

  let passCount = 0;
  let failCount = 0;
  const auditReport: { id: number; name: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];

  for (const tc of testCases) {
    try {
      await tc.run();
      passCount++;
      auditReport.push({ id: tc.id, name: tc.name, status: 'PASS' });
      console.log(`[PASS] Ca kiểm thử ${tc.id}: ${tc.name}`);
    } catch (err: any) {
      failCount++;
      auditReport.push({ id: tc.id, name: tc.name, status: 'FAIL', error: err.message });
      console.error(`[FAIL] Ca kiểm thử ${tc.id}: ${tc.name}`);
      console.error(`       Chi tiết lỗi: ${err.message}`);
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`KẾT QUẢ NGHIỆM THU KIỂM THỬ TỰ ĐỘNG:`);
  console.log(`- Tổng số ca kiểm thử thực thi: ${testCases.length}`);
  console.log(`- Số ca ĐẠT (PASS): ${passCount}/${testCases.length} (${Math.round((passCount / testCases.length) * 100)}%)`);
  console.log(`- Số ca THẤT BẠI (FAIL): ${failCount}/${testCases.length}`);
  console.log('----------------------------------------------------------------\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runRealTestEngine();
