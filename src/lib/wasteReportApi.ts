import { WasteReport, WasteReportSubmissionPayload, ReportProcessingStatus } from '../types';

/**
 * Fetch all verified public waste reports
 */
export async function fetchWasteReports(status?: string): Promise<WasteReport[]> {
  try {
    const url = status && status !== 'all' 
      ? `/api/waste-reports?status=${encodeURIComponent(status)}`
      : '/api/waste-reports';

    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) {
      console.warn('Notice fetching waste reports:', res.status);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.reports) ? data.reports : [];
  } catch (err) {
    console.warn('Network error fetching waste reports:', err);
    return [];
  }
}

export interface SubmitReportResult {
  success: boolean;
  approved: boolean;
  report?: WasteReport;
  rejectionReason?: string;
  message?: string;
  error?: string;
}

/**
 * Submit a citizen waste report for AI moderation & publishing
 */
export async function submitWasteReport(
  payload: WasteReportSubmissionPayload
): Promise<SubmitReportResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 seconds timeout

    let res: Response;
    try {
      res = await fetch('/api/waste-reports/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return {
          success: false,
          approved: false,
          error: 'Thời gian kết nối kiểm duyệt AI quá lâu (quá 45 giây). Vui lòng kiểm tra lại kết nối mạng và thử gửi lại.',
        };
      }
      return {
        success: false,
        approved: false,
        error: 'Không thể kết nối đến máy chủ: ' + (fetchErr.message || 'Lỗi mạng'),
      };
    }
    clearTimeout(timeoutId);

    // Safely check content-type before parsing JSON to prevent "Unexpected token '<' / 'T'"
    const contentType = res.headers.get('content-type') || '';
    let data: any = null;

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.warn('Failed to parse JSON response:', jsonErr);
      }
    }

    if (!data) {
      // Non-JSON response (HTML error page like "The page cannot be displayed", 413, 502, 504)
      const text = await res.text().catch(() => '');
      console.warn('Non-JSON server response:', res.status, text.slice(0, 150));

      if (res.status === 413) {
        return {
          success: false,
          approved: false,
          error: 'Dung lượng hình ảnh gửi lên vượt quá giới hạn máy chủ (tối đa 500MB). Hệ thống đã tự động tối ưu hóa, vui lòng bấm gửi lại.',
        };
      }

      if (res.status === 502 || res.status === 504 || res.status === 503) {
        return {
          success: false,
          approved: false,
          error: 'Máy chủ kiểm duyệt AI đang phản hồi chậm hoặc tạm thời bận. Vui lòng bấm "Gửi bài phản ánh" để thử lại sau 5 giây.',
        };
      }

      return {
        success: false,
        approved: false,
        error: `Máy chủ phản hồi mã lỗi ${res.status}. Vui lòng thử lại sau giây lát.`,
      };
    }

    if (res.status === 422 || data.approved === false) {
      // Rejection by moderation
      return {
        success: false,
        approved: false,
        rejectionReason: data.rejectionReason || 'Hình ảnh hoặc nội dung không đạt tiêu chuẩn kiểm duyệt.',
      };
    }

    if (!res.ok) {
      return {
        success: false,
        approved: false,
        error: data.error || `HTTP ${res.status}: Gửi phản ánh thất bại`,
      };
    }

    return {
      success: true,
      approved: true,
      report: data.report,
      message: data.message || 'Bài phản ánh đã được phê duyệt và hiển thị công khai!',
    };
  } catch (err: any) {
    return {
      success: false,
      approved: false,
      error: err.message || 'Lỗi kết nối mạng đến máy chủ kiểm duyệt AI',
    };
  }
}

/**
 * Upvote / endorse a community report
 */
export async function upvoteReport(
  reportId: string,
  userId: string
): Promise<{ success: boolean; report?: WasteReport; error?: string }> {
  try {
    const res = await fetch(`/api/waste-reports/${encodeURIComponent(reportId)}/upvote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Lỗi gửi lượt đồng tình', report: data.report };
    }
    return { success: true, report: data.report };
  } catch (err: any) {
    console.warn('Notice upvoting report:', err);
    return { success: false, error: err?.message || 'Lỗi mạng' };
  }
}

/**
 * Update report status (e.g. mark as investigating or resolved)
 */
export async function updateReportStatus(
  reportId: string,
  status: ReportProcessingStatus,
  resolutionNote?: string,
  requesterId?: string,
  adminKey?: string
): Promise<{ success: boolean; report?: WasteReport; error?: string }> {
  try {
    const res = await fetch(`/api/waste-reports/${encodeURIComponent(reportId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolutionNote, requesterId, adminKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Lỗi cập nhật trạng thái' };
    }
    return { success: true, report: data.report };
  } catch (err: any) {
    console.warn('Notice updating report status:', err);
    return { success: false, error: err?.message || 'Lỗi mạng' };
  }
}

/**
 * Delete a waste report (requires author or admin)
 */
export async function deleteReportApi(
  reportId: string,
  requesterId?: string,
  adminKey?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/waste-reports/${encodeURIComponent(reportId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, adminKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Lỗi xóa bài phản ánh' };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('Notice deleting report:', err);
    return { success: false, error: err?.message || 'Lỗi mạng' };
  }
}

/**
 * Clear all waste reports (admin only)
 */
export async function clearAllReportsApi(adminKey?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/waste-reports/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Lỗi xóa toàn bộ bài' };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('Notice clearing all reports:', err);
    return { success: false, error: err?.message || 'Lỗi mạng' };
  }
}
