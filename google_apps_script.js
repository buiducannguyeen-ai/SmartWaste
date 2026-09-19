/**
 * ==============================================================================
 * ECOSORT AI - GOOGLE APPS SCRIPT CHO CUỘC THI STEM MÔI TRƯỜNG
 * ==============================================================================
 * 
 * Hướng dẫn thiết lập nhanh:
 * 1. Mở trang tính Google Sheets mới tại: https://sheets.new
 * 2. Trên thanh menu, chọn: Tiện ích mở rộng (Extensions) > Apps Script
 * 3. Xóa code mặc định, dán toàn bộ đoạn mã này vào file `Code.gs` và nhấn biểu tượng Lưu (Ctrl+S).
 * 4. Nhấn nút "Triển khai" (Deploy) ở góc trên bên phải > "Tùy chọn triển khai mới" (New deployment).
 * 5. Chọn loại: "Ứng dụng web" (Web app)
 *    - Mô tả: EcoSort STEM Leaderboard & Logs
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me - your email)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone) -> RẤT QUAN TRỌNG ĐỂ CÁC THIẾT BỊ ĐỀU KẾT NỐI ĐƯỢC!
 * 6. Nhấn "Triển khai" (Deploy) và Cấp quyền (Authorize Access).
 * 7. Sao chép "URL của ứng dụng web" (dạng: https://script.google.com/macros/s/.../exec) 
 *    và dán vào website EcoSort AI.
 */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var playersSheet = getOrCreateSheet(ss, "Bảng Xếp Hạng", [
      "ID", "Tên Người Chơi", "Đơn Vị / Lớp", "Avatar", "Tổng Điểm", "Số Lần Đúng", "Hữu Cơ", "Tái Chế", "Vô Cơ", "Cập Nhật Lần Cuối"
    ]);
    var historySheet = getOrCreateSheet(ss, "Lịch Sử Phân Loại", [
      "ID Lần Quét", "Thời Gian", "Tên Người Chơi", "Tên Món Rác", "Loại Rác", "Điểm Cộng", "Nguồn Quét", "Độ Tin Cậy"
    ]);

    var players = getPlayersData(playersSheet);
    var logs = getHistoryData(historySheet);

    var response = {
      status: "success",
      timestamp: new Date().toISOString(),
      sheetTitle: ss.getName(),
      totalPlayers: players.length,
      totalScans: logs.length,
      players: players,
      history: logs
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var playersSheet = getOrCreateSheet(ss, "Bảng Xếp Hạng", [
      "ID", "Tên Người Chơi", "Đơn Vị / Lớp", "Avatar", "Tổng Điểm", "Số Lần Đúng", "Hữu Cơ", "Tái Chế", "Vô Cơ", "Cập Nhật Lần Cuối"
    ]);
    var historySheet = getOrCreateSheet(ss, "Lịch Sử Phân Loại", [
      "ID Lần Quét", "Thời Gian", "Tên Người Chơi", "Tên Món Rác", "Loại Rác", "Điểm Cộng", "Nguồn Quét", "Độ Tin Cậy"
    ]);

    var payload = {};
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (ex) {
        payload = e.parameter || {};
      }
    } else {
      payload = e.parameter || {};
    }

    var action = payload.action || "recordWaste";

    // 1. GHI NHẬN ĐIỂM KHI NHẬN DIỆN RÁC
    if (action === "recordWaste") {
      var playerName = (payload.playerName || "Thí sinh STEM").trim();
      var organization = (payload.organization || "Khối Sáng Tạo STEM").trim();
      var avatar = payload.avatar || "🌱";
      var itemName = payload.itemName || "Vật thể rác";
      var category = (payload.category || "organic").toLowerCase();
      var source = payload.source || "webcam";
      var confidence = payload.confidence || 0.95;

      // QUY TẮC TÍCH ĐIỂM CHUẨN STEM:
      // Rác hữu cơ → +1 điểm
      // Rác tái chế → +2 điểm
      // Rác vô cơ → +3 điểm
      var points = 1;
      if (category === "organic") {
        points = 1;
      } else if (category === "recyclable") {
        points = 2;
      } else if (category === "inorganic") {
        points = 3;
      }

      // Cập nhật người chơi trong sheet "Bảng Xếp Hạng"
      var userResult = updatePlayerScore(playersSheet, playerName, organization, avatar, points, category);

      // Thêm dòng lịch sử vào sheet "Lịch Sử Phân Loại"
      var now = new Date();
      var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");
      var logId = "scan_" + now.getTime();
      
      historySheet.appendRow([
        logId,
        timeStr,
        playerName,
        itemName,
        category,
        points,
        source,
        (Math.round(confidence * 100)) + "%"
      ]);

      // Tự động sắp xếp Bảng Xếp Hạng theo Tổng Điểm (Cột 5) từ cao xuống thấp
      sortLeaderboard(playersSheet);

      var updatedLeaderboard = getPlayersData(playersSheet);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "recordWaste",
        awardedPoints: points,
        player: userResult,
        leaderboard: updatedLeaderboard
      })).setMimeType(ContentService.MimeType.JSON);
    } 
    
    // 2. ĐĂNG KÝ HOẶC THÊM THÍ SINH MỚI (Bắt đầu với 0 điểm)
    else if (action === "registerPlayer") {
      var pName = (payload.playerName || "Thí sinh mới").trim();
      var pOrg = (payload.organization || "Khối Sáng Tạo STEM").trim();
      var pAvatar = payload.avatar || "🌱";

      var regResult = registerNewPlayer(playersSheet, pName, pOrg, pAvatar);
      sortLeaderboard(playersSheet);
      var currentLeaderboard = getPlayersData(playersSheet);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "registerPlayer",
        player: regResult,
        leaderboard: currentLeaderboard
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. GỬI MÃ PIN XÁC THỰC EMAIL (CHỐNG GMAIL ẢO QUA GOOGLE MAILAPP)
    else if (action === "sendPinEmail") {
      var targetEmail = (payload.email || "").trim();
      var pinCode = (payload.pin || "").toString().trim();
      var subjectLine = payload.subject || ("[EcoSort AI] Mã PIN xác thực tài khoản: " + pinCode);
      var htmlMessage = payload.htmlBody || ("<p>Mã PIN xác thực tài khoản EcoSort STEM của bạn là: <strong>" + pinCode + "</strong> (Có hiệu lực 10 phút).</p>");

      if (!targetEmail || !pinCode) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Thiếu email hoặc mã PIN"
        })).setMimeType(ContentService.MimeType.JSON);
      }

      MailApp.sendEmail({
        to: targetEmail,
        subject: subjectLine,
        htmlBody: htmlMessage
      });

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "sendPinEmail",
        recipient: targetEmail,
        message: "Đã gửi email chứa mã PIN thành công qua Google MailApp!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Unknown action: " + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------------------------
// CÁC HÀM TIỆN ÍCH QUẢN LÝ GOOGLE SHEETS
// ------------------------------------------------------------------------------

function getOrCreateSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    // Format Header Row
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#38bdf8");
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getPlayersData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var players = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[1] || row[1].toString().trim() === "") continue;

    players.push({
      id: row[0] ? row[0].toString() : "p_" + i,
      name: row[1].toString(),
      organization: row[2] ? row[2].toString() : "Khối Sáng Tạo STEM",
      avatar: row[3] ? row[3].toString() : "🌱",
      totalPoints: Number(row[4]) || 0,
      correctCount: Number(row[5]) || 0,
      organicCount: Number(row[6]) || 0,
      recyclableCount: Number(row[7]) || 0,
      inorganicCount: Number(row[8]) || 0,
      lastActive: row[9] ? new Date(row[9]).getTime() : Date.now()
    });
  }

  // Sắp xếp giảm dần theo tổng điểm, nếu hòa điểm thì so số lần đúng
  players.sort(function(a, b) {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.correctCount - a.correctCount;
  });

  return players;
}

function getHistoryData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var logs = [];
  // Lấy tối đa 100 lần phân loại gần nhất
  var startIndex = Math.max(1, data.length - 100);
  for (var i = data.length - 1; i >= startIndex; i--) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;

    logs.push({
      id: row[0] ? row[0].toString() : "scan_" + i,
      timestamp: row[1] ? new Date(row[1]).getTime() : Date.now(),
      userName: row[2] ? row[2].toString() : "Thí sinh",
      itemName: row[3] ? row[3].toString() : "Rác phân loại",
      category: row[4] ? row[4].toString() : "organic",
      points: Number(row[5]) || 1,
      source: row[6] ? row[6].toString() : "webcam",
      confidence: row[7] ? parseFloat(row[7].toString().replace("%", "")) / 100 : 0.95
    });
  }

  return logs;
}

function updatePlayerScore(sheet, playerName, organization, avatar, pointsToAdd, category) {
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString().trim().toLowerCase() === playerName.toLowerCase()) {
      rowIndex = i + 1; // 1-based row index in Google Sheets
      break;
    }
  }

  var now = new Date();
  var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");

  if (rowIndex > 0) {
    // Đã tồn tại -> Cộng dồn điểm
    var currentPoints = Number(sheet.getRange(rowIndex, 5).getValue()) || 0;
    var currentCorrect = Number(sheet.getRange(rowIndex, 6).getValue()) || 0;
    var currentOrganic = Number(sheet.getRange(rowIndex, 7).getValue()) || 0;
    var currentRecyclable = Number(sheet.getRange(rowIndex, 8).getValue()) || 0;
    var currentInorganic = Number(sheet.getRange(rowIndex, 9).getValue()) || 0;

    var newPoints = currentPoints + pointsToAdd;
    var newCorrect = currentCorrect + 1;
    var newOrg = currentOrganic + (category === "organic" ? 1 : 0);
    var newRec = currentRecyclable + (category === "recyclable" ? 1 : 0);
    var newInorg = currentInorganic + (category === "inorganic" ? 1 : 0);

    sheet.getRange(rowIndex, 3).setValue(organization);
    sheet.getRange(rowIndex, 4).setValue(avatar);
    sheet.getRange(rowIndex, 5).setValue(newPoints);
    sheet.getRange(rowIndex, 6).setValue(newCorrect);
    sheet.getRange(rowIndex, 7).setValue(newOrg);
    sheet.getRange(rowIndex, 8).setValue(newRec);
    sheet.getRange(rowIndex, 9).setValue(newInorg);
    sheet.getRange(rowIndex, 10).setValue(timeStr);

    return {
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: newPoints,
      correctCount: newCorrect,
      organicCount: newOrg,
      recyclableCount: newRec,
      inorganicCount: newInorg,
      lastActive: now.getTime()
    };
  } else {
    // Chưa tồn tại -> Tạo mới với số điểm vừa quét được
    var newId = "p_" + now.getTime();
    var orgCount = category === "organic" ? 1 : 0;
    var recCount = category === "recyclable" ? 1 : 0;
    var inorgCount = category === "inorganic" ? 1 : 0;

    sheet.appendRow([
      newId,
      playerName,
      organization,
      avatar,
      pointsToAdd,
      1,
      orgCount,
      recCount,
      inorgCount,
      timeStr
    ]);

    return {
      id: newId,
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: pointsToAdd,
      correctCount: 1,
      organicCount: orgCount,
      recyclableCount: recCount,
      inorganicCount: inorgCount,
      lastActive: now.getTime()
    };
  }
}

function registerNewPlayer(sheet, playerName, organization, avatar) {
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString().trim().toLowerCase() === playerName.toLowerCase()) {
      rowIndex = i + 1;
      break;
    }
  }

  var now = new Date();
  var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 3).setValue(organization);
    sheet.getRange(rowIndex, 4).setValue(avatar);
    sheet.getRange(rowIndex, 10).setValue(timeStr);

    return {
      id: sheet.getRange(rowIndex, 1).getValue().toString(),
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: Number(sheet.getRange(rowIndex, 5).getValue()) || 0,
      correctCount: Number(sheet.getRange(rowIndex, 6).getValue()) || 0
    };
  } else {
    var newId = "p_" + now.getTime();
    sheet.appendRow([
      newId,
      playerName,
      organization,
      avatar,
      0, // Khởi tạo với đúng 0 điểm
      0, // 0 lần đúng
      0, 0, 0,
      timeStr
    ]);

    return {
      id: newId,
      name: playerName,
      organization: organization,
      avatar: avatar,
      totalPoints: 0,
      correctCount: 0,
      organicCount: 0,
      recyclableCount: 0,
      inorganicCount: 0
    };
  }
}

function sortLeaderboard(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    // Sắp xếp vùng dữ liệu từ dòng 2:
    // Cột 5 (Tổng Điểm): Giảm dần (ascending: false)
    // Cột 6 (Số Lần Đúng): Giảm dần (ascending: false)
    var range = sheet.getRange(2, 1, lastRow - 1, 10);
    range.sort([
      { column: 5, ascending: false },
      { column: 6, ascending: false }
    ]);
  }
}
