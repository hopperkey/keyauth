const fs = require("fs");
const path = require("path");

// ⚠️ Serverless chỉ cho ghi /tmp
const DB_FILE = path.join("/tmp", "database.json");

let db = {
  admins: ["1279324001180844085"],
  supports: ["1279324001180844085"],
  applications: [],
  keys: []
};

const loadDB = () => {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch (e) {
      console.log("DB read error");
    }
  }
};

const saveDB = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.log("DB write error");
  }
};

const resJson = (data) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  },
  body: JSON.stringify(data)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return resJson({ success: false, message: "POST only" });
  }

  loadDB();

  const body = JSON.parse(event.body || "{}");
  const action = body.action;
  const userId = body.user_id || body.userId || "Guest";

  switch (action) {

    case "test":
      return resJson({ success: true });

    case "check_support":
      return resJson({
        success: true,
        is_support: db.supports.includes(userId) || db.admins.includes(userId)
      });

    case "check_permission":
      return resJson({
        success: true,
        is_admin: db.admins.includes(userId),
        app_count: db.applications.length
      });

    case "get_apps":
      return resJson({ success: true, applications: db.applications });

    case "create_app":
      const newApp = {
        name: body.app_name,
        api_key: "AK-" + Math.random().toString(36).substr(2, 10).toUpperCase(),
        created_by: userId,
        created_at: new Date().toISOString()
      };
      db.applications.push(newApp);
      saveDB();
      return resJson({ success: true });

    case "delete_app":
      db.applications = db.applications.filter(a => a.name !== body.app_name);
      db.keys = db.keys.filter(k => k.api !== body.api);
      saveDB();
      return resJson({ success: true });

    case "get_keys":
      const now = new Date();
      const keys = (body.api ? db.keys.filter(k => k.api === body.api) : db.keys)
        .map(k => {
          let status = "Inactive";
          if (k.banned) status = "Banned";
          else if (new Date(k.expires_at) < now) status = "Expired";
          else if (k.hwid) status = "Active";
          return { ...k, status };
        });
      return resJson({ success: true, keys });

    case "create_key":
      const newKey = {
        key: (body.prefix || "VIP") + "-" + Math.random().toString(36).substr(2, 8).toUpperCase(),
        api: body.api,
        prefix: body.prefix || "VIP",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + body.days * 86400000).toISOString(),
        device_limit: parseInt(body.device_limit) || 1,
        hwids: [],
        hwid: null,
        system_info: "No Device",
        used: false,
        banned: false
      };
      db.keys.push(newKey);
      saveDB();
      return resJson({ success: true, key: newKey.key });

    case "delete_key":
      db.keys = db.keys.filter(k => k.key !== body.key);
      saveDB();
      return resJson({ success: true });

    case "reset_hwid":
      const kr = db.keys.find(k => k.key === body.key);
      if (kr) {
        kr.hwids = [];
        kr.hwid = null;
        kr.used = false;
        kr.system_info = "Reset by admin";
        saveDB();
      }
      return resJson({ success: true });

    case "ban_key":
      const kb = db.keys.find(k => k.key === body.key);
      if (kb) {
        kb.banned = true;
        saveDB();
      }
      return resJson({ success: true });

    case "validate_key":
      const vk = db.keys.find(k => k.key === body.key);
      const hwid = body.hwid;

      if (!vk) return resJson({ success: false, message: "Key not found" });
      if (vk.banned) return resJson({ success: false, message: "Key banned" });
      if (new Date(vk.expires_at) < new Date()) return resJson({ success: false, message: "Expired" });
      if (!hwid) return resJson({ success: false, message: "Missing HWID" });

      if (!vk.hwids.includes(hwid)) {
        if (vk.hwids.length >= vk.device_limit)
          return resJson({ success: false, message: "Device limit reached" });
        vk.hwids.push(hwid);
      }

      vk.hwid = hwid;
      vk.used = true;
      vk.system_info = body.system_info || "Android";
      saveDB();

      return resJson({ success: true, expires_at: vk.expires_at });

    case "add_support":
      if (!db.supports.includes(body.user_id)) {
        db.supports.push(body.user_id);
        saveDB();
      }
      return resJson({ success: true });

    case "delete_support":
      db.supports = db.supports.filter(id => id !== body.user_id);
      saveDB();
      return resJson({ success: true });

    default:
      return resJson({ success: false, message: "Invalid action" });
  }
};
