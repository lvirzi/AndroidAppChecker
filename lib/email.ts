export interface UpdateInfo {
  name: string;
  packageId: string;
  icon: string | null;
  oldVersion: string;
  newVersion: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildEmailHTML(updates: UpdateInfo[]): string {
  const rows = updates
    .map(
      (u) => `
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;vertical-align:middle">
          ${
            u.icon
              ? `<img src="${esc(u.icon)}" alt="" width="36" height="36"
                   style="border-radius:8px;vertical-align:middle;margin-right:10px;display:inline-block">`
              : '<span style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#e2e8f0;vertical-align:middle;margin-right:10px"></span>'
          }<span style="font-weight:600;color:#1e293b;font-size:14px">${esc(u.name)}</span>
          <div style="font-size:11px;color:#94a3b8;font-family:monospace;margin-top:3px;margin-left:46px">${esc(u.packageId)}</div>
        </td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:13px;color:#94a3b8;white-space:nowrap;text-decoration:line-through">${esc(u.oldVersion)}</td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:14px;color:#16a34a;font-weight:700;white-space:nowrap">${esc(u.newVersion)}</td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0">
          <a href="https://play.google.com/store/apps/details?id=${esc(u.packageId)}"
             style="display:inline-block;padding:5px 12px;background:#22c55e;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600">
            View
          </a>
        </td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:32px 16px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:580px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:14px 14px 0 0;padding:26px 28px">
      <h1 style="margin:0;color:white;font-size:19px;font-weight:700;letter-spacing:-0.01em">
        📱 Android App Updates Available
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">
        ${updates.length} app${updates.length > 1 ? 's have' : ' has'} a new version on the Play Store
      </p>
    </div>
    <div style="background:white;border-radius:0 0 14px 14px;box-shadow:0 2px 8px rgba(0,0,0,0.07)">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px 18px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">App</th>
            <th style="padding:10px 18px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">From</th>
            <th style="padding:10px 18px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">To</th>
            <th style="padding:10px 18px"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="padding:14px 18px;background:#f8fafc;border-radius:0 0 14px 14px">
        <p style="margin:0;font-size:11px;color:#94a3b8">
          Sent by <strong>Android App Update Checker</strong>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
