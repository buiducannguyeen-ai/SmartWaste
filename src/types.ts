export type WasteCategory = 'organic' | 'recyclable' | 'inorganic';

export interface WasteClassificationResult {
  category: WasteCategory;
  itemName: string;
  points: number; // 1 for organic, 2 for recyclable, 3 for inorganic
  confidence: number;
  description: string;
  binColor: 'green' | 'yellow' | 'orange';
  recyclingTip: string;
  ecoImpact?: string;
  rawImage?: string;
  source?: 'webcam' | 'file_upload' | 'reference_view';
  isReferenceOnly?: boolean;
  isDuplicate?: boolean;
  duplicateSimilarity?: number;
  isScreenOrPhotoSpoof?: boolean;
  spoofReason?: string;
  fingerprintHash?: string;
}

export interface DuplicateAlertInfo {
  itemName: string;
  similarity: number; // 0.0 - 1.0 (e.g. 0.96 = 96%)
  timeSinceLastScanMs: number;
  reason: string;
  suggestedAction: string;
  matchedRecord?: {
    id: string;
    itemName: string;
    timestamp: number;
    thumbnail?: string;
    userName?: string;
    fingerprintHash?: string;
  };
  currentThumbnail?: string;
  isExactFileMatch?: boolean;
  isScreenSpoof?: boolean;
}

export interface ScannedFingerprintRecord {
  id: string;
  dHash: string; // 64-bit difference hash
  aHash: string; // 64-bit average hash
  checksum: string; // content byte signature
  timestamp: number;
  itemName: string;
  category: WasteCategory;
  points: number;
  userName?: string;
  thumbnail?: string;
}


export interface WasteHistoryRecord extends WasteClassificationResult {
  id: string;
  timestamp: number;
  userName: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  organization: string; // Lớp, Chi đội STEM, hoặc Trường
  avatar: string;
  totalPoints: number;
  correctCount: number; // Số lần phân loại đúng
  organicCount: number;
  recyclableCount: number;
  inorganicCount: number;
  createdAt: number;
  isEmailVerified?: boolean;
  isGoogleVerified?: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  email?: string;
  organization: string;
  totalPoints: number;
  correctCount: number; // Số lần phân loại đúng
  organicCount?: number;
  recyclableCount?: number;
  inorganicCount?: number;
  avatar: string;
  levelTitle: string;
  lastActive: number;
  isCurrentUser?: boolean;
}

export interface DemoWasteItem {
  id: string;
  category: WasteCategory;
  itemName: string;
  points: number;
  confidence: number;
  description: string;
  binColor: 'green' | 'yellow' | 'orange';
  recyclingTip: string;
  ecoImpact: string;
  emoji: string;
  imageUrl?: string;
}

export type ReportSeverity = 'low' | 'medium' | 'high' | 'urgent';
export type ReportProcessingStatus = 'reported' | 'investigating' | 'resolved';

export interface WasteReportModerationDetails {
  approved: boolean;
  imageCheckPassed: boolean;
  textCheckPassed: boolean;
  isAIGenerated?: boolean;
  aiAuthenticityPassed?: boolean;
  rejectionReason?: string;
  wasteTypeDetected?: string;
  severityLevel?: ReportSeverity;
  summary?: string;
  checkedAt: number;
  moderatedBy: string;
}

export interface WasteReport {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorOrg?: string;
  location: string;
  description: string;
  imageUrl: string;
  wasteTypeDetected: string;
  severityLevel: ReportSeverity;
  moderationStatus: 'approved' | 'rejected';
  moderationDetails: WasteReportModerationDetails;
  status: ReportProcessingStatus;
  createdAt: number;
  upvotes: number;
  resolutionNote?: string;
}

export interface WasteReportSubmissionPayload {
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  authorOrg?: string;
  location: string;
  description: string;
  image: string; // base64 or URL
}

