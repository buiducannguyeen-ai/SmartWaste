import assert from 'assert';
import {
  recordClassification,
  getLeaderboard,
  upsertPlayer,
  createPendingScanSession,
  invalidateLeaderboardCache
} from '../server/store';
import { computeServerImageFingerprint } from '../server/serverFingerprint';

async function runConcurrencyAndOptimizationTests() {
  console.log('--- RUNNING CONCURRENCY & OPTIMIZATION TEST SUITE ---');

  // Test 1: Image Fingerprint Performance Benchmark (< 3ms)
  console.log('\n[TEST 1] Testing Image Fingerprint Performance (< 3ms)...');
  // Generate a mock base64 JPEG-like entropy buffer
  const mockBuffer = Buffer.alloc(32768);
  for (let i = 0; i < mockBuffer.length; i++) {
    mockBuffer[i] = (i * 37 + 17) % 256;
  }
  const base64Data = 'data:image/jpeg;base64,' + mockBuffer.toString('base64');

  const startFp = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    const fp = computeServerImageFingerprint(base64Data);
    assert.strictEqual(typeof fp.dHash, 'string');
    assert.strictEqual(fp.dHash.length, 64);
    assert.strictEqual(typeof fp.checksum, 'string');
    assert.strictEqual(fp.checksum.length, 64);
  }
  const avgTimeMs = (performance.now() - startFp) / iterations;
  console.log(`✓ Average Fingerprint Computation Time: ${avgTimeMs.toFixed(3)}ms (Threshold: < 3.0ms)`);
  assert.ok(avgTimeMs < 3.0, `Fingerprint execution time ${avgTimeMs}ms exceeds 3ms limit!`);

  // Test 2: In-Memory Leaderboard Cache Performance (< 0.5ms)
  console.log('\n[TEST 2] Testing In-Memory Leaderboard Cache Performance (< 0.5ms)...');
  // Seed some players
  for (let i = 0; i < 20; i++) {
    upsertPlayer({
      id: `perf_player_${i}`,
      name: `Thí sinh Tốc độ ${i}`,
      totalPoints: i * 5,
    });
  }
  invalidateLeaderboardCache();
  // Warm up cache
  const firstCall = getLeaderboard();
  assert.ok(firstCall.length >= 20);

  const startCache = performance.now();
  const cacheIterations = 200;
  for (let i = 0; i < cacheIterations; i++) {
    const cachedLb = getLeaderboard();
    assert.ok(cachedLb.length >= 20);
  }
  const avgCacheMs = (performance.now() - startCache) / cacheIterations;
  console.log(`✓ Average Cached Leaderboard Retrieval Time: ${avgCacheMs.toFixed(4)}ms (Threshold: < 0.5ms)`);
  assert.ok(avgCacheMs < 0.5, `Leaderboard cache retrieval time ${avgCacheMs}ms exceeds 0.5ms!`);

  // Test 3: Concurrent Race Condition & Idempotency Lock
  console.log('\n[TEST 3] Testing Concurrent Race Condition (5 concurrent calls with same scanId)...');
  const student = upsertPlayer({
    id: 'race_test_student',
    name: 'Thí sinh Chống Gian Lận',
    totalPoints: 10,
  });
  const initialPoints = student.totalPoints;

  // Create a pending scan session
  const session = createPendingScanSession({
    userId: 'race_test_student',
    itemName: 'Vỏ chai nước khoáng',
    category: 'recyclable',
    points: 2,
    confidence: 0.98,
    isWaste: true,
    isUncertain: false,
  });
  const testScanId = session.scanId;

  // Launch 5 simultaneous parallel promises trying to claim the same scanId
  const concurrentResults = await Promise.all([
    recordClassification({
      userId: 'race_test_student',
      userName: 'Thí sinh Chống Gian Lận',
      itemName: 'Vỏ chai nước khoáng',
      category: 'recyclable',
      points: 2,
      source: 'webcam',
      scanId: testScanId,
    }),
    recordClassification({
      userId: 'race_test_student',
      userName: 'Thí sinh Chống Gian Lận',
      itemName: 'Vỏ chai nước khoáng',
      category: 'recyclable',
      points: 2,
      source: 'webcam',
      scanId: testScanId,
    }),
    recordClassification({
      userId: 'race_test_student',
      userName: 'Thí sinh Chống Gian Lận',
      itemName: 'Vỏ chai nước khoáng',
      category: 'recyclable',
      points: 2,
      source: 'webcam',
      scanId: testScanId,
    }),
    recordClassification({
      userId: 'race_test_student',
      userName: 'Thí sinh Chống Gian Lận',
      itemName: 'Vỏ chai nước khoáng',
      category: 'recyclable',
      points: 2,
      source: 'webcam',
      scanId: testScanId,
    }),
    recordClassification({
      userId: 'race_test_student',
      userName: 'Thí sinh Chống Gian Lận',
      itemName: 'Vỏ chai nước khoáng',
      category: 'recyclable',
      points: 2,
      source: 'webcam',
      scanId: testScanId,
    }),
  ]);

  const successCount = concurrentResults.filter((r) => r.success && !r.alreadyProcessed && r.pointsAwarded > 0).length;
  const duplicateBlockedCount = concurrentResults.filter((r) => r.alreadyProcessed || !r.success || r.pointsAwarded === 0).length;

  console.log(`✓ Concurrent Requests Processed: 5`);
  console.log(`✓ Exactly One Award Succeeded: ${successCount === 1 ? 'PASS (1 award)' : 'FAIL'}`);
  console.log(`✓ Duplicates Blocked / Deduplicated: ${duplicateBlockedCount} (Expected: 4)`);

  assert.strictEqual(successCount, 1, 'Race condition failure: More than 1 request succeeded in awarding points!');
  assert.strictEqual(duplicateBlockedCount, 4, 'Duplicate blocking failed: Not all duplicate concurrent requests were caught!');

  // Verify player points only incremented by 2, never 10
  const finalLeaderboard = getLeaderboard();
  const playerAfterRace = finalLeaderboard.find((p) => p.id === 'race_test_student');
  assert.strictEqual(
    playerAfterRace?.totalPoints,
    initialPoints + 2,
    `Player score corruption! Expected ${initialPoints + 2}, got ${playerAfterRace?.totalPoints}`
  );
  console.log(`✓ Final Player Total Points: ${playerAfterRace?.totalPoints} (Strictly +2 points awarded, no double counting)`);

  console.log('\n--- ALL CONCURRENCY & OPTIMIZATION TESTS PASSED SUCCESSFULLY! ---');
}

runConcurrencyAndOptimizationTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
