import type { SourceType } from './storage';

export interface UpdateInfo {
  name: string;
  packageId: string;
  icon: string | null;
  oldVersion: string;
  newVersion: string;
  sourceType: SourceType;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeBadge(type: SourceType): string {
  const styles: Record<SourceType, [string, string, string]> = {
    android: ['#dcfce7', '#15803d', 'ANDROID'],
    ios:     ['#1e293b', '#ffffff', 'iOS'],
    web:     ['#dbeafe', '#1d4ed8', 'WEB'],
  };
  const [bg, color, label] = styles[type];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.04em;background:${bg};color:${color};vertical-align:middle;margin-right:8px">${label}</span>`;
}

function storeUrl(u: UpdateInfo): string {
  if (u.sourceType === 'ios') return `https://apps.apple.com/app/id${esc(u.packageId)}`;
  if (u.sourceType === 'web') return esc(u.packageId);
  return `https://play.google.com/store/apps/details?id=${esc(u.packageId)}`;
}

function storeLinkLabel(type: SourceType): string {
  if (type === 'ios') return 'App Store →';
  if (type === 'web') return 'Visit page →';
  return 'Play Store →';
}

function changeCell(u: UpdateInfo): string {
  if (u.sourceType === 'web') {
    return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600">Content changed</span>`;
  }
  return `
    <span style="font-family:monospace;font-size:12px;color:#94a3b8;text-decoration:line-through;white-space:nowrap">${esc(u.oldVersion)}</span>
    <span style="color:#94a3b8;margin:0 6px;font-size:12px">→</span>
    <span style="font-family:monospace;font-size:13px;font-weight:700;color:#16a34a;white-space:nowrap">${esc(u.newVersion)}</span>
  `;
}

function identifierCell(u: UpdateInfo): string {
  if (u.sourceType === 'web') {
    try {
      const hostname = new URL(u.packageId).hostname;
      return `<a href="${esc(u.packageId)}" style="font-size:11px;color:#3b82f6;text-decoration:none;font-family:monospace">${esc(hostname)}</a>`;
    } catch {
      return `<span style="font-size:11px;color:#94a3b8;font-family:monospace">${esc(u.packageId.slice(0, 60))}</span>`;
    }
  }
  return `<span style="font-size:11px;color:#94a3b8;font-family:monospace">${esc(u.packageId)}</span>`;
}

export function buildEmailHTML(updates: UpdateInfo[]): string {
  const appCount = updates.filter((u) => u.sourceType !== 'web').length;
  const webCount = updates.filter((u) => u.sourceType === 'web').length;

  const subtitleParts: string[] = [];
  if (appCount) subtitleParts.push(`${appCount} app update${appCount > 1 ? 's' : ''}`);
  if (webCount) subtitleParts.push(`${webCount} web change${webCount > 1 ? 's' : ''}`);
  const subtitle = subtitleParts.join(' · ');

  const rows = updates
    .map(
      (u) => `
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;vertical-align:middle">
          ${typeBadge(u.sourceType)}${
            u.icon
              ? `<img src="${esc(u.icon)}" alt="" width="32" height="32" style="border-radius:7px;vertical-align:middle;margin-right:8px;display:inline-block">`
              : ''
          }<span style="font-weight:600;color:#1e293b;font-size:14px;vertical-align:middle">${esc(u.name)}</span>
          <div style="margin-top:3px;padding-left:2px">${identifierCell(u)}</div>
        </td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;white-space:nowrap;vertical-align:middle">
          ${changeCell(u)}
        </td>
        <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;vertical-align:middle">
          <a href="${storeUrl(u)}"
             style="display:inline-block;padding:5px 12px;background:#22c55e;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap">
            ${storeLinkLabel(u.sourceType)}
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
        🔔 Updates Detected
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">${subtitle}</p>
    </div>
    <div style="background:white;border-radius:0 0 14px 14px;box-shadow:0 2px 8px rgba(0,0,0,0.07)">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px 18px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Item</th>
            <th style="padding:10px 18px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Change</th>
            <th style="padding:10px 18px"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="padding:14px 18px;background:#f8fafc;border-radius:0 0 14px 14px">
        <p style="margin:0;font-size:11px;color:#94a3b8">
          Sent by <strong>Update Checker</strong>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
