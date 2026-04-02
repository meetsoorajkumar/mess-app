/**
 * Meal Tracker — Google Apps Script Backend (v2 with Admin)
 * ==========================================================
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire file into the editor
 * 3. Set SHEET_ID below to your Google Spreadsheet ID
 *    (from URL: docs.google.com/spreadsheets/d/SHEET_ID/edit)
 * 4. Deploy → New Deployment → Web App
 *       Execute as : Me
 *       Who has access : Anyone
 * 5. Copy the Web App URL into index.html as APPS_SCRIPT_URL
 *
 * SHEETS USED:
 *   "People" tab  — person roster (id, name, active, order, createdAt)
 *   "Meals"  tab  — meal log entries
 *
 * Both tabs are auto-created on first run.
 */

const SHEET_ID    = "YOUR_GOOGLE_SHEET_ID_HERE";
const PEOPLE_TAB  = "People";
const MEALS_TAB   = "Meals";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ss() { return SpreadsheetApp.openById(SHEET_ID); }

function getOrCreate(name, headers, headerStyle) {
  const spreadsheet = ss();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    const r = sheet.getRange(1, 1, 1, headers.length);
    r.setBackground(headerStyle.bg);
    r.setFontColor(headerStyle.fg);
    r.setFontWeight("bold");
    sheet.setColumnWidths(1, headers.length, 150);
  }
  return sheet;
}

function getPeopleSheet() {
  return getOrCreate(
    PEOPLE_TAB,
    ["ID", "Name", "Active", "Order", "CreatedAt"],
    { bg: "#5d9460", fg: "#ffffff" }
  );
}

function getMealsSheet() {
  return getOrCreate(
    MEALS_TAB,
    ["Timestamp", "Name", "Meal", "Units", "Date", "Day"],
    { bg: "#d97d42", fg: "#ffffff" }
  );
}

function generateId() {
  return Utilities.getUuid().replace(/-/g, "").substring(0, 12);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET — read operations ─────────────────────────────────────────────────────
function doGet(e) {
  const action = e?.parameter?.action || "health";

  try {
    if (action === "getPeople") {
      const sheet = getPeopleSheet();
      const rows  = sheet.getDataRange().getValues();
      // Skip header row
      const people = rows.slice(1).map(r => ({
        id:        String(r[0]),
        name:      String(r[1]),
        active:    r[2] === true || r[2] === "TRUE" || r[2] === true,
        order:     Number(r[3]) || 0,
        createdAt: String(r[4] || ""),
      })).sort((a, b) => a.order - b.order);

      return jsonResponse({ success: true, people });
    }

    // Health check
    return jsonResponse({ success: true, status: "ok", service: "Meal Tracker API v2" });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── POST — write operations ───────────────────────────────────────────────────
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" });
  }

  const { action } = body;

  try {
    // ── Submit meal entries ──────────────────────────────────────────────────
    if (action === "submitMeals") {
      const { entries } = body;
      if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error("No entries provided");
      }

      const sheet = getMealsSheet();
      const tz    = Session.getScriptTimeZone();
      const rows  = entries.map(entry => {
        const ts  = new Date(entry.timestamp);
        return [
          entry.timestamp,
          entry.name,
          entry.meal,
          entry.units,
          Utilities.formatDate(ts, tz, "yyyy-MM-dd"),
          Utilities.formatDate(ts, tz, "EEEE"),
        ];
      });

      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
      return jsonResponse({ success: true, saved: rows.length });
    }

    // ── Add person ───────────────────────────────────────────────────────────
    if (action === "addPerson") {
      const { name } = body;
      if (!name || String(name).trim().length < 2) {
        throw new Error("Name must be at least 2 characters");
      }

      const sheet  = getPeopleSheet();
      const rows   = sheet.getDataRange().getValues();
      const order  = rows.length; // header + existing rows = next order
      const id     = generateId();
      const now    = new Date().toISOString();

      sheet.appendRow([id, String(name).trim(), true, order, now]);
      return jsonResponse({ success: true, id });
    }

    // ── Toggle person active/inactive ────────────────────────────────────────
    if (action === "togglePerson") {
      const { id, active } = body;
      const sheet = getPeopleSheet();
      const data  = sheet.getDataRange().getValues();

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
          sheet.getRange(i + 1, 3).setValue(Boolean(active)); // col C = Active
          return jsonResponse({ success: true });
        }
      }
      throw new Error(`Person ${id} not found`);
    }

    // ── Remove person ────────────────────────────────────────────────────────
    if (action === "removePerson") {
      const { id } = body;
      const sheet  = getPeopleSheet();
      const data   = sheet.getDataRange().getValues();

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true });
        }
      }
      throw new Error(`Person ${id} not found`);
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}
