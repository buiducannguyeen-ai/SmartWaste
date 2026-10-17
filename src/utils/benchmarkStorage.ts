import {
  BenchmarkCategory,
  BenchmarkTestSample,
  BenchmarkStats,
  CategoryEvaluationMetric,
  EdgeCaseType,
} from '../types';

const STORAGE_KEY = 'ecosort_ai_benchmark_samples_v1';

export const BENCHMARK_CATEGORIES: { key: BenchmarkCategory; label: string; color: string; badgeClass: string }[] = [
  { key: 'organic', label: 'Rác Hữu Cơ', color: '#10b981', badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' },
  { key: 'recyclable', label: 'Rác Tái Chế', color: '#eab308', badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-500/40' },
  { key: 'inorganic', label: 'Rác Vô Cơ', color: '#f97316', badgeClass: 'bg-orange-950/80 text-orange-300 border-orange-500/40' },
  { key: 'special_hazardous', label: 'Rác Nguy Hại / Thu Gom Riêng', color: '#ef4444', badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-500/40' },
];

export const EDGE_CASE_PRESETS: { type: EdgeCaseType; label: string; defaultCategory: BenchmarkCategory; sampleName: string; note: string }[] = [
  {
    type: 'tetra_pak',
    label: 'Hộp sữa giấy 6 lớp (Tetra Pak)',
    defaultCategory: 'recyclable',
    sampleName: 'Hộp sữa giấy học đường ép dẹp',
    note: 'Cấu tạo phức hợp nhôm-giấy-PE; chỉ tái chế nếu tách thu gom riêng vỏ hộp sữa học đường, ép dẹp dốc ráo.',
  },
  {
    type: 'liquid_cup',
    label: 'Ly trà sữa còn nước đá',
    defaultCategory: 'recyclable',
    sampleName: 'Ly trà sữa nhựa PP còn nước và đá',
    note: 'Còn chất lỏng bên trong; bắt buộc đổ cạn nước trước khi tái chế, AI phải nhận diện được chất lỏng.',
  },
  {
    type: 'oily_paper',
    label: 'Giấy dính dầu mỡ (hộp pizza / đồ chiên)',
    defaultCategory: 'inorganic',
    sampleName: 'Bìa hộp pizza dính mỡ phô mai',
    note: 'Dầu mỡ thấm sâu vào thớ giấy khiến bột giấy không thể nghiền sạch; bắt buộc là rác vô cơ.',
  },
  {
    type: 'old_battery',
    label: 'Pin cũ / Rác điện tử nguy hại',
    defaultCategory: 'special_hazardous',
    sampleName: 'Pin tiểu AA 1.5V đã qua sử dụng',
    note: 'Rác thải nguy hại chứa chì và thủy ngân; tuyệt đối không bỏ thùng rác thường, gom riêng.',
  },
  {
    type: 'greasy_plastic',
    label: 'Hộp nhựa dính thức ăn mỡ',
    defaultCategory: 'inorganic',
    sampleName: 'Hộp nhựa dùng một lần dính sốt dầu mỡ',
    note: 'Nhựa dính dầu mỡ hữu cơ nặng không tráng sạch ngay; thuộc nhóm vô cơ để tránh ôi thiu.',
  },
  {
    type: 'multilayer_packaging',
    label: 'Bao bì snack / mì tôm màng nhôm phức hợp',
    defaultCategory: 'inorganic',
    sampleName: 'Túi bánh snack tráng bạc nhiều lớp',
    note: 'Màng ghép đa lớp phức hợp không thể bóc tách cơ học thông thường; phân loại vào rác vô cơ.',
  },
];

/**
 * 30 STEM benchmark sample templates (10 organic, 10 recyclable, 10 inorganic & hazardous)
 * Never contains prefilled results or simulated points.
 * All samples start with hasRunAI: false and empty images, ready for empirical lab capture.
 */
export const STEM_BENCHMARK_PRESET_TEMPLATES: Omit<BenchmarkTestSample, 'id' | 'createdAt'>[] = [
  // 10 HỮU CƠ (ORGANIC)
  {
    sampleCode: 'TST-001',
    itemName: 'Vỏ chuối chín đốm nâu',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Chất hữu cơ phân hủy sinh học, giàu kali cho phân bón.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-002',
    itemName: 'Bã cà phê phin nguyên chất',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Chất hữu cơ làm xốp đất, giàu nitơ compost.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-003',
    itemName: 'Vỏ cam sành gọt vỏ',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Rác hữu cơ sinh hoạt nhà bếp.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-004',
    itemName: 'Lá bàng khô rụng sân trường',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Chất thải cây xanh học đường, ủ mục mùn hữu cơ.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-005',
    itemName: 'Cọng rau muống thừa sau bữa ăn',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Rau xanh thực vật phân hủy nhanh.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-006',
    itemName: 'Vỏ trứng gà bóp vụn',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Vỏ trứng canxi hữu cơ phân hủy tốt cho đất.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-007',
    itemName: 'Lõi ngô ngọt luộc',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Chất hữu cơ xơ xenlulozo tự nhiên.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-008',
    itemName: 'Vỏ dưa hấu thái lát',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Rác hữu cơ nhiều nước, ủ phân compost.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-009',
    itemName: 'Bã trà túi lọc thảo mộc',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Bã chè khô tự nhiên.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-010',
    itemName: 'Cơm nguội thừa bữa trưa',
    groundTruthCategory: 'organic',
    groundTruthNotes: 'Tinh bột thực phẩm hữu cơ thừa.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },

  // 10 TÁI CHẾ (RECYCLABLE) - Bao gồm các mẫu khó
  {
    sampleCode: 'TST-011',
    itemName: 'Chai nhựa PET 500ml rỗng sạch',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'Nhựa PET nguyên sinh trong suốt, tiêu chuẩn vàng tái chế hạt nhựa.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-012',
    itemName: 'Vỏ lon nước ngọt nhôm sạch rỗng',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'Kim loại nhôm tái chế vô hạn lần không giảm chất lượng.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-013',
    itemName: 'Hộp sữa giấy 6 lớp Tetra Pak',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'VẬT THỂ KHÓ: Màng ghép nhôm-giấy-PE; tái chế nếu trường có chương trình thu gom riêng vỏ hộp sữa học đường (yêu cầu ép dẹp dốc ráo).',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'tetra_pak',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-014',
    itemName: 'Ly trà sữa nhựa PP còn đọng nước & đá',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'VẬT THỂ KHÓ: Ly nhựa có thể tái chế NHƯNG còn chất lỏng bên trong. AI phải cảnh báo đổ cạn nước và tách nắp/ống hút trước khi bỏ thùng tái chế.',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'liquid_cup',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-015',
    itemName: 'Vở học sinh viết hết giấy trắng sạch',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'Giấy trắng bột nguyên chất không dính dầu mỡ, dễ nghiền bột tái chế.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-016',
    itemName: 'Bìa carton sóng 3 lớp khô ráo',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'Thùng giấy carton khô sạch, dễ nén ép đóng kiện tái chế.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-017',
    itemName: 'Chai nước khoáng còn 1/3 nước',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'VẬT THỂ KHÓ: Nhựa PET tái chế nhưng còn nước. Quy chuẩn STEM: AI phải khóa 0 điểm và yêu cầu đổ cạn nước quét lại lần 2.',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'liquid_cup',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-018',
    itemName: 'Tờ báo in giấy xốp khô',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'Báo giấy mực in tiêu chuẩn khô ráo.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-019',
    itemName: 'Vỏ lon cá hộp kim loại đã tráng sạch',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'Kim loại sắt tây/nhôm tráng sạch mỡ có thể luyện kim tái sinh.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-020',
    itemName: 'Hộp nhựa HDPE đựng sữa chua đã rửa sạch',
    groundTruthCategory: 'recyclable',
    groundTruthNotes: 'Nhựa HDPE số 2 độ bền cao, đã rửa tráng sạch ráo nước.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },

  // 10 VÔ CƠ & RÁC ĐẶC BIỆT / NGUY HẠI - Bao gồm các mẫu khó
  {
    sampleCode: 'TST-021',
    itemName: 'Hộp bánh pizza dính dầu mỡ',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'VẬT THỂ KHÓ DỄ NHẦM: Mặc dù là giấy bìa nhưng dầu mỡ thấm sâu thớ sợi không thể hòa tan trong nước, làm hỏng bột giấy sạch. Bắt buộc bỏ rác vô cơ.',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'oily_paper',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-022',
    itemName: 'Pin tiểu AA 1.5V đã qua sử dụng',
    groundTruthCategory: 'special_hazardous',
    groundTruthNotes: 'VẬT THỂ NGUY HẠI ĐẶC BIỆT: Chứa chì, thủy ngân độc hại. TUYỆT ĐỐI không bỏ thùng rác thường; chuyển tới điểm thu gom pin chuyên dụng học đường.',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'old_battery',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-023',
    itemName: 'Hộp cơm nhựa dùng một lần dính sốt mỡ cay',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'VẬT THỂ KHÓ: Hộp nhựa dính thức ăn dầu mỡ ôi thiu không tráng rửa sạch ngay, phải bỏ vào rác vô cơ.',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'greasy_plastic',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-024',
    itemName: 'Bao bì mì tôm tráng nhôm đa lớp',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'VẬT THỂ KHÓ: Màng nhôm phức hợp đa lớp (BOPP/PE/Al) không thể phân tách cơ học thông thường.',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'multilayer_packaging',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-025',
    itemName: 'Túi nilon quai xách màu dính đất bẩn',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'Nhựa mỏng LDPE dính bẩn không có giá trị thu gom tái chế thông thường.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-026',
    itemName: 'Hộp xốp đựng thức ăn vỡ dính dầu',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'Nhựa xốp PS số 6 giòn gãy dính bẩn, xử lý chôn lấp/đốt kiểm soát.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-027',
    itemName: 'Khăn giấy ướt dùng một lần',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'Làm từ sợi nhân tạo tổng hợp khó tan trong nước.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-028',
    itemName: 'Khẩu trang y tế 4 lớp đã sử dụng',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'Chứa vi hạt nhựa kháng nước và mầm bệnh tiềm ẩn, bỏ rác vô cơ.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-029',
    itemName: 'Mảnh chai thủy tinh vỡ sắc nhọn',
    groundTruthCategory: 'special_hazardous',
    groundTruthNotes: 'RÁC ĐẶC BIỆT CẢNH BÁO AN TOÀN: Vật sắc nhọn nguy hiểm, bắt buộc bọc bìa carton dày trước khi bỏ rác vô cơ tránh sát thương.',
    isDifficultOrEdgeCase: true,
    edgeCaseType: 'other',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
  {
    sampleCode: 'TST-030',
    itemName: 'Vỏ bút bi hết mực vỏ nhựa tổng hợp',
    groundTruthCategory: 'inorganic',
    groundTruthNotes: 'Nhựa hỗn hợp dính ngòi kim loại và cặn mực, rác vô cơ còn lại.',
    isDifficultOrEdgeCase: false,
    edgeCaseType: 'none',
    isGroundTruthLocked: true,
    hasRunAI: false,
    handlingSuitability: 'unreviewed',
  },
];

/**
 * Loads benchmark samples from localStorage
 */
export function loadBenchmarkSamples(): BenchmarkTestSample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to load benchmark samples from storage:', err);
    return [];
  }
}

/**
 * Saves benchmark samples to localStorage
 */
export function saveBenchmarkSamples(samples: BenchmarkTestSample[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch (err) {
    console.warn('Failed to save benchmark samples to storage:', err);
  }
}

/**
 * Clears all benchmark test data
 */
export function clearBenchmarkSamples(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear benchmark samples:', err);
  }
}

/**
 * Initializes the 30 STEM benchmark framework without prefilled AI results.
 * Respects strict testing: real images must be captured or uploaded in lab.
 */
export function generateEmptyStemPresets(): BenchmarkTestSample[] {
  const now = Date.now();
  return STEM_BENCHMARK_PRESET_TEMPLATES.map((tmpl, index) => ({
    ...tmpl,
    id: `bench-sample-${index + 1}-${now}`,
    createdAt: now,
  }));
}

/**
 * Maps raw backend AI category response to our BenchmarkCategory enum
 */
export function mapAiResultToBenchmarkCategory(aiData: {
  category?: string;
  isHazardousOrSpecial?: boolean;
  isUncertain?: boolean;
  confidence?: number;
  itemName?: string;
}): BenchmarkCategory {
  if (aiData.isUncertain) {
    return 'uncertain';
  }

  // Detect special hazardous items (batteries, mercury, sharps)
  const itemNameLower = (aiData.itemName || '').toLowerCase();
  const isBatteryOrHazardous =
    aiData.isHazardousOrSpecial === true ||
    /pin|ắc quy|pin cũ|thủy ngân|nhiệt kế|hóa chất|rác điện tử/i.test(itemNameLower);

  if (isBatteryOrHazardous) {
    return 'special_hazardous';
  }

  const rawCat = (aiData.category || '').toLowerCase().trim();
  if (rawCat === 'organic') return 'organic';
  if (rawCat === 'recyclable') return 'recyclable';
  if (rawCat === 'inorganic') return 'inorganic';
  if (rawCat === 'special_hazardous') return 'special_hazardous';
  if (rawCat === 'uncertain' || rawCat === 'unknown') return 'uncertain';

  return 'uncertain';
}

/**
 * Rigorous empirical statistics calculation from ACTUAL tested samples.
 * Zero simulated data.
 */
export function calculateBenchmarkStats(samples: BenchmarkTestSample[]): BenchmarkStats {
  const targetCount = 30;
  const actualCreatedCount = samples.length;
  const testedSamples = samples.filter((s) => s.hasRunAI);
  const actualTestedCount = testedSamples.length;

  let correctCount = 0;
  let incorrectCount = 0;
  let uncertainOrRejectedCount = 0;
  let totalConfidenceSum = 0;

  // Category trackers
  const catKeys: BenchmarkCategory[] = ['organic', 'recyclable', 'inorganic', 'special_hazardous', 'uncertain'];
  const catMetrics: Record<BenchmarkCategory, CategoryEvaluationMetric> = {
    organic: { category: 'organic', label: 'Hữu Cơ', totalGroundTruth: 0, testedCount: 0, correctCount: 0, incorrectCount: 0, uncertainCount: 0, accuracyRate: 0, precision: 0, recall: 0 },
    recyclable: { category: 'recyclable', label: 'Tái Chế', totalGroundTruth: 0, testedCount: 0, correctCount: 0, incorrectCount: 0, uncertainCount: 0, accuracyRate: 0, precision: 0, recall: 0 },
    inorganic: { category: 'inorganic', label: 'Vô Cơ', totalGroundTruth: 0, testedCount: 0, correctCount: 0, incorrectCount: 0, uncertainCount: 0, accuracyRate: 0, precision: 0, recall: 0 },
    special_hazardous: { category: 'special_hazardous', label: 'Nguy Hại / Đặc Biệt', totalGroundTruth: 0, testedCount: 0, correctCount: 0, incorrectCount: 0, uncertainCount: 0, accuracyRate: 0, precision: 0, recall: 0 },
    uncertain: { category: 'uncertain', label: 'Chưa Chắc Chắn', totalGroundTruth: 0, testedCount: 0, correctCount: 0, incorrectCount: 0, uncertainCount: 0, accuracyRate: 0, precision: 0, recall: 0 },
  };

  // Count ground truths across all created samples
  for (const s of samples) {
    if (catMetrics[s.groundTruthCategory]) {
      catMetrics[s.groundTruthCategory].totalGroundTruth += 1;
    }
  }

  // Confusion matrix: [groundTruth][predicted]
  const rowLabels: BenchmarkCategory[] = ['organic', 'recyclable', 'inorganic', 'special_hazardous'];
  const colLabels: BenchmarkCategory[] = ['organic', 'recyclable', 'inorganic', 'special_hazardous', 'uncertain'];

  const matrix: Record<BenchmarkCategory, Record<BenchmarkCategory, number>> = {
    organic: { organic: 0, recyclable: 0, inorganic: 0, special_hazardous: 0, uncertain: 0 },
    recyclable: { organic: 0, recyclable: 0, inorganic: 0, special_hazardous: 0, uncertain: 0 },
    inorganic: { organic: 0, recyclable: 0, inorganic: 0, special_hazardous: 0, uncertain: 0 },
    special_hazardous: { organic: 0, recyclable: 0, inorganic: 0, special_hazardous: 0, uncertain: 0 },
    uncertain: { organic: 0, recyclable: 0, inorganic: 0, special_hazardous: 0, uncertain: 0 },
  };

  // Handling suitability tracking
  let handlingReviewedCount = 0;
  let handlingSuitableCount = 0;
  let handlingNeedsAdjustmentCount = 0;
  let handlingUnsuitableCount = 0;

  // Difficult edge cases tracking
  const edgeCaseStatsMap: Record<EdgeCaseType, { tested: number; correct: number }> = {
    tetra_pak: { tested: 0, correct: 0 },
    liquid_cup: { tested: 0, correct: 0 },
    oily_paper: { tested: 0, correct: 0 },
    old_battery: { tested: 0, correct: 0 },
    greasy_plastic: { tested: 0, correct: 0 },
    multilayer_packaging: { tested: 0, correct: 0 },
    none: { tested: 0, correct: 0 },
    other: { tested: 0, correct: 0 },
  };

  let totalEdgeCasesTested = 0;
  let totalEdgeCasesCorrect = 0;

  // Process tested samples
  for (const s of testedSamples) {
    const trueCat = s.groundTruthCategory;
    const predCat = s.predictedCategory || 'uncertain';
    const conf = typeof s.aiConfidence === 'number' ? s.aiConfidence : 0;
    totalConfidenceSum += conf;

    // Record in category metrics
    if (catMetrics[trueCat]) {
      catMetrics[trueCat].testedCount += 1;
    }

    // Record in confusion matrix
    if (matrix[trueCat] && matrix[trueCat][predCat] !== undefined) {
      matrix[trueCat][predCat] += 1;
    }

    // Check correctness
    if (predCat === 'uncertain' || s.isUncertain) {
      uncertainOrRejectedCount += 1;
      if (catMetrics[trueCat]) catMetrics[trueCat].uncertainCount += 1;
    } else if (predCat === trueCat) {
      correctCount += 1;
      if (catMetrics[trueCat]) catMetrics[trueCat].correctCount += 1;
    } else {
      incorrectCount += 1;
      if (catMetrics[trueCat]) catMetrics[trueCat].incorrectCount += 1;
    }

    // Handling review
    if (s.handlingSuitability && s.handlingSuitability !== 'unreviewed') {
      handlingReviewedCount += 1;
      if (s.handlingSuitability === 'suitable') handlingSuitableCount += 1;
      else if (s.handlingSuitability === 'needs_adjustment') handlingNeedsAdjustmentCount += 1;
      else if (s.handlingSuitability === 'unsuitable') handlingUnsuitableCount += 1;
    }

    // Edge cases
    if (s.isDifficultOrEdgeCase && s.edgeCaseType && s.edgeCaseType !== 'none') {
      totalEdgeCasesTested += 1;
      edgeCaseStatsMap[s.edgeCaseType].tested += 1;
      if (predCat === trueCat) {
        totalEdgeCasesCorrect += 1;
        edgeCaseStatsMap[s.edgeCaseType].correct += 1;
      }
    }
  }

  // Calculate percentage rates
  const empiricalAccuracyRate =
    actualTestedCount > 0 ? Math.round((correctCount / actualTestedCount) * 1000) / 10 : 0;

  const averageAiConfidence =
    actualTestedCount > 0 ? Math.round((totalConfidenceSum / actualTestedCount) * 1000) / 10 : 0;

  // Category accuracy, precision, and recall
  for (const cat of rowLabels) {
    const metric = catMetrics[cat];
    metric.accuracyRate = metric.testedCount > 0
      ? Math.round((metric.correctCount / metric.testedCount) * 1000) / 10
      : 0;

    // Recall: True Positives / Total Actual True
    metric.recall = metric.testedCount > 0
      ? Math.round((metric.correctCount / metric.testedCount) * 1000) / 10
      : 0;

    // Precision: True Positives / Total Predicted as this category
    let totalPredictedAsThis = 0;
    for (const r of rowLabels) {
      totalPredictedAsThis += matrix[r][cat] || 0;
    }
    metric.precision = totalPredictedAsThis > 0
      ? Math.round((metric.correctCount / totalPredictedAsThis) * 1000) / 10
      : 0;
  }

  // Edge case breakdown items
  const edgeCaseItems = [
    { type: 'tetra_pak' as EdgeCaseType, label: 'Hộp sữa giấy 6 lớp', tested: edgeCaseStatsMap.tetra_pak.tested, correct: edgeCaseStatsMap.tetra_pak.correct },
    { type: 'liquid_cup' as EdgeCaseType, label: 'Ly trà sữa còn nước', tested: edgeCaseStatsMap.liquid_cup.tested, correct: edgeCaseStatsMap.liquid_cup.correct },
    { type: 'oily_paper' as EdgeCaseType, label: 'Giấy dính dầu mỡ', tested: edgeCaseStatsMap.oily_paper.tested, correct: edgeCaseStatsMap.oily_paper.correct },
    { type: 'old_battery' as EdgeCaseType, label: 'Pin cũ nguy hại', tested: edgeCaseStatsMap.old_battery.tested, correct: edgeCaseStatsMap.old_battery.correct },
    { type: 'greasy_plastic' as EdgeCaseType, label: 'Hộp nhựa dính mỡ', tested: edgeCaseStatsMap.greasy_plastic.tested, correct: edgeCaseStatsMap.greasy_plastic.correct },
    { type: 'multilayer_packaging' as EdgeCaseType, label: 'Bao bì màng nhôm', tested: edgeCaseStatsMap.multilayer_packaging.tested, correct: edgeCaseStatsMap.multilayer_packaging.correct },
  ];

  const edgeCaseAccuracyRate =
    totalEdgeCasesTested > 0 ? Math.round((totalEdgeCasesCorrect / totalEdgeCasesTested) * 1000) / 10 : 0;

  const suitabilityRate =
    handlingReviewedCount > 0 ? Math.round((handlingSuitableCount / handlingReviewedCount) * 1000) / 10 : 0;

  return {
    targetCount,
    actualCreatedCount,
    actualTestedCount,
    correctCount,
    incorrectCount,
    uncertainOrRejectedCount,
    empiricalAccuracyRate,
    averageAiConfidence,
    categories: catMetrics,
    handlingStats: {
      totalReviewed: handlingReviewedCount,
      suitableCount: handlingSuitableCount,
      needsAdjustmentCount: handlingNeedsAdjustmentCount,
      unsuitableCount: handlingUnsuitableCount,
      suitabilityRate,
    },
    edgeCaseStats: {
      totalTarget: 6,
      totalTested: totalEdgeCasesTested,
      correctCount: totalEdgeCasesCorrect,
      accuracyRate: edgeCaseAccuracyRate,
      items: edgeCaseItems,
    },
    confusionMatrix: {
      rowLabels,
      colLabels,
      matrix,
    },
  };
}

/**
 * Exports benchmark test records and summary stats to a formal CSV file (UTF-8 with BOM)
 */
export function exportBenchmarkToCsv(samples: BenchmarkTestSample[], stats: BenchmarkStats): void {
  const categoryNames: Record<BenchmarkCategory, string> = {
    organic: 'Hữu Cơ',
    recyclable: 'Tái Chế',
    inorganic: 'Vô Cơ',
    special_hazardous: 'Nguy Hại / Đặc Biệt',
    uncertain: 'Chưa Chắc Chắn',
  };

  const suitabilityNames: Record<string, string> = {
    suitable: 'Phù hợp (Đạt chuẩn STEM)',
    needs_adjustment: 'Cần điều chỉnh',
    unsuitable: 'Chưa phù hợp',
    unreviewed: 'Chưa đánh giá',
  };

  const lines: string[] = [];

  // Metadata headers
  lines.push('BÁO CÁO THỰC NGHIỆM ĐÁNH GIÁ ĐỘ CHÍNH XÁC AI - DỰ ÁN ECOSORT AI STEM 2026');
  lines.push(`Thời gian kết xuất:,"${new Date().toLocaleString('vi-VN')}"`);
  lines.push(`Tổng mẫu mục tiêu:,${stats.targetCount}`);
  lines.push(`Số mẫu thực tế đã tạo:,${stats.actualCreatedCount}`);
  lines.push(`Số mẫu thực tế đã kiểm thử AI:,${stats.actualTestedCount}`);
  lines.push(`Số mẫu phân loại ĐÚNG:,${stats.correctCount}`);
  lines.push(`Số mẫu phân loại SAI:,${stats.incorrectCount}`);
  lines.push(`Số mẫu AI từ chối / chưa chắc chắn:,${stats.uncertainOrRejectedCount}`);
  lines.push(`ĐỘ CHÍNH XÁC THỰC NGHIỆM (Empirical Accuracy):,${stats.empiricalAccuracyRate}%`);
  lines.push(`ĐỘ TIN CẬY TRUNG BÌNH CỦA AI (Average AI Confidence):,${stats.averageAiConfidence}%`);
  lines.push(`Tỷ lệ hướng xử lý AI phù hợp:,${stats.handlingStats.suitabilityRate}% (${stats.handlingStats.suitableCount}/${stats.handlingStats.totalReviewed} mẫu đã thẩm định)`);
  lines.push('');

  // Category breakdown table
  lines.push('THỐNG KÊ ĐỘ CHÍNH XÁC THEO TỪNG NHÓM RÁC');
  lines.push('Nhóm Rác,Số Mẫu Chuẩn,Đã Kiểm Thử,Đúng,Sai,Chưa Chắc Chắn,Độ Chính Xác (%),Precision (%),Recall (%)');
  const catKeys: BenchmarkCategory[] = ['organic', 'recyclable', 'inorganic', 'special_hazardous'];
  for (const k of catKeys) {
    const c = stats.categories[k];
    lines.push(`"${c.label}",${c.totalGroundTruth},${c.testedCount},${c.correctCount},${c.incorrectCount},${c.uncertainCount},${c.accuracyRate}%,${c.precision}%,${c.recall}%`);
  }
  lines.push('');

  // Tricky edge cases breakdown
  lines.push('KẾT QUẢ KIỂM THỬ CÁC VẬT THỂ DỄ NHẦM LẪN / PHỨC TẠP');
  lines.push('Tên Nhóm Vật Thể Khó,Đã Kiểm Thử,Đúng,Tỷ Lệ Chính Xác (%)');
  for (const item of stats.edgeCaseStats.items) {
    const rate = item.tested > 0 ? Math.round((item.correct / item.tested) * 1000) / 10 : 0;
    lines.push(`"${item.label}",${item.tested},${item.correct},${rate}%`);
  }
  lines.push('');

  // Detailed test samples table
  lines.push('DANH SÁCH CHI TIẾT 30 MẪU KIỂM THỬ THỰC TẾ');
  lines.push('Mã Mẫu,Tên Vật Thể,Vật Thể Khó,Nhóm Chuẩn (Ground Truth),Nhóm AI Dự Đoán,Kết Quả So Khớp,Độ Tin Cậy AI (%),Có Chất Lỏng,Hướng Xử Lý AI Đề Xuất,Đánh Giá Hướng Xử Lý,Ghi Chú Người Đánh Giá,Thời Gian');

  for (const s of samples) {
    const isTested = s.hasRunAI;
    const trueName = categoryNames[s.groundTruthCategory] || s.groundTruthCategory;
    const predName = s.predictedCategory ? (categoryNames[s.predictedCategory] || s.predictedCategory) : 'Chưa chạy';

    let matchResult = 'CHƯA CHẠY AI';
    if (isTested) {
      if (s.isUncertain || s.predictedCategory === 'uncertain') {
        matchResult = 'CHƯA CHẮC CHẮN / TỪ CHỐI';
      } else if (s.predictedCategory === s.groundTruthCategory) {
        matchResult = 'ĐÚNG';
      } else {
        matchResult = 'SAI';
      }
    }

    const confStr = isTested && typeof s.aiConfidence === 'number'
      ? `${Math.round(s.aiConfidence * 100)}%`
      : 'N/A';

    const edgeStr = s.isDifficultOrEdgeCase ? 'Vật thể khó' : 'Thông thường';
    const liquidStr = s.hasLiquid ? 'Có nước/chất lỏng' : 'Rỗng / Khô';

    // Summary of AI steps
    let stepsSummary = '';
    if (s.aiRecommendedSteps && s.aiRecommendedSteps.length > 0) {
      stepsSummary = s.aiRecommendedSteps.map((st, i) => `${i + 1}. ${st.instruction}`).join(' | ');
    } else if (s.aiHandlingSummary) {
      stepsSummary = s.aiHandlingSummary;
    }

    const suitabilityStr = suitabilityNames[s.handlingSuitability] || s.handlingSuitability;
    const notesStr = (s.groundTruthNotes || '') + (s.evaluatorHandlingNotes ? ` [Đánh giá: ${s.evaluatorHandlingNotes}]` : '');
    const dateStr = s.evaluatedAt ? new Date(s.evaluatedAt).toLocaleString('vi-VN') : (s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '');

    // Escape CSV cell values
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

    lines.push([
      escapeCsv(s.sampleCode),
      escapeCsv(s.itemName),
      escapeCsv(edgeStr),
      escapeCsv(trueName),
      escapeCsv(predName),
      escapeCsv(matchResult),
      escapeCsv(confStr),
      escapeCsv(liquidStr),
      escapeCsv(stepsSummary),
      escapeCsv(suitabilityStr),
      escapeCsv(notesStr),
      escapeCsv(dateStr),
    ].join(','));
  }

  // Generate CSV Blob with UTF-8 BOM (\uFEFF) so Excel on Windows / Mac displays Vietnamese correctly
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `EcoSort_STEM_AI_Accuracy_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export samples to JSON backup file
 */
export function exportBenchmarkToJson(samples: BenchmarkTestSample[]): void {
  const jsonContent = JSON.stringify(samples, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `EcoSort_STEM_Benchmark_Dataset_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
