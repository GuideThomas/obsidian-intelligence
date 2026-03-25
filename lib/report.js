const fs = require('fs');
const path = require('path');
const { buildSnapshot } = require('./snapshot');

function generateReport(flags = {}) {
  const { getConfig } = require('./config');
  const config = getConfig(flags);

  console.log('Building vault snapshot...');
  const snapshot = buildSnapshot();

  const defaultOutput = config.vaultPath
    ? path.join(config.vaultPath, 'vault-report.html')
    : './vault-report.html';
  const outputPath = flags.output || defaultOutput;

  console.log('Generating HTML report...');
  const html = buildHTML(snapshot);

  const dir = path.dirname(outputPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`\nReport written: ${outputPath}`);
  console.log(`  Size: ${Math.round(html.length / 1024)} KB`);

  if (flags.open) {
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32' ? 'start' :
                process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} "${outputPath}"`);
    console.log('  Opening in browser...');
  }
}

function buildHTML(snapshot) {
  const t = snapshot.totals;
  const engagement = snapshot.engagement;
  const dist = {};
  for (const e of engagement.distribution) {
    dist[e.level] = e.count;
  }
  const total = Object.values(dist).reduce((a, b) => a + b, 0);

  // Health score calculation
  const healthScore = calculateHealthScore(snapshot);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vault Intelligence Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
${getCSS()}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Vault Intelligence Report</h1>
    <p class="subtitle">Generated ${new Date(snapshot.generated_at).toLocaleString()} &middot; Source: ${snapshot.source || 'filesystem'}</p>
  </header>

  <!-- Overview Cards -->
  <section class="cards">
    <div class="card">
      <div class="card-value">${t.notes}</div>
      <div class="card-label">Notes</div>
    </div>
    <div class="card">
      <div class="card-value">${t.tags}</div>
      <div class="card-label">Tags</div>
    </div>
    <div class="card">
      <div class="card-value">${t.links}</div>
      <div class="card-label">Links</div>
    </div>
    <div class="card">
      <div class="card-value ${t.broken_links > 0 ? 'warn' : ''}">${t.broken_links}</div>
      <div class="card-label">Broken Links</div>
    </div>
    <div class="card">
      <div class="card-value ${t.orphans > 10 ? 'warn' : ''}">${t.orphans}</div>
      <div class="card-label">Orphans</div>
    </div>
  </section>

  <!-- Health Score -->
  <section class="health">
    <h2>Vault Health</h2>
    <div class="health-bar-container">
      <div class="health-bar" style="width: ${healthScore.score}%; background: ${healthScore.color}"></div>
    </div>
    <div class="health-score">${healthScore.score}/100 <span class="health-label">${healthScore.label}</span></div>
    <ul class="health-factors">
      ${healthScore.factors.map(f => `<li class="${f.status}">${f.label}: ${f.detail}</li>`).join('\n      ')}
    </ul>
  </section>

  <!-- Engagement Chart -->
  <section class="chart-section">
    <h2>Engagement Distribution</h2>
    <div class="chart-wrapper">
      <canvas id="engagementChart"></canvas>
    </div>
    <noscript>
      <table class="data-table">
        <tr><th>Level</th><th>Count</th><th>%</th></tr>
        ${engagement.distribution.map(e => `<tr><td>${e.level}</td><td>${e.count}</td><td>${total > 0 ? ((e.count / total) * 100).toFixed(1) : 0}%</td></tr>`).join('\n        ')}
      </table>
    </noscript>
  </section>

  <!-- Tag Cloud -->
  <section>
    <h2>Tag Cloud</h2>
    <div class="tag-cloud">
      ${buildTagCloud(snapshot.graph.top_tags)}
    </div>
  </section>

  <!-- Hub Notes -->
  <section>
    <h2>Hub Notes (Most Connected)</h2>
    <table class="data-table">
      <tr><th>Note</th><th>Connections</th></tr>
      ${snapshot.graph.hubs.slice(0, 10).map(h => `<tr><td>${escapeHtml(h.title)}</td><td>${h.connections}</td></tr>`).join('\n      ')}
    </table>
  </section>

  <!-- Orphan Notes -->
  ${buildCollapsibleSection('Orphan Notes', t.orphans + ' isolated notes',
    snapshot.graph.folders.length > 0 ? '' : '<p>No orphans found.</p>'
  )}

  <!-- Broken Links -->
  ${t.broken_links > 0 ? `<section>
    <h2>Broken Links (${t.broken_links})</h2>
    <p class="muted">Links pointing to notes that don't exist.</p>
  </section>` : ''}

  <!-- Folder Activity -->
  <section class="chart-section">
    <h2>Folder Activity</h2>
    <div class="chart-wrapper">
      <canvas id="folderChart"></canvas>
    </div>
    <noscript>
      <table class="data-table">
        <tr><th>Folder</th><th>Total</th><th>Active (7d)</th></tr>
        ${snapshot.folder_activity.slice(0, 15).map(f => `<tr><td>${escapeHtml(f.folder)}</td><td>${f.total}</td><td>${f.active_7d}</td></tr>`).join('\n        ')}
      </table>
    </noscript>
  </section>

  <!-- Revival Candidates -->
  ${snapshot.revival_candidates.length > 0 ? `<section>
    <h2>Revival Candidates</h2>
    <p class="muted">Dormant notes with strong connections - worth revisiting.</p>
    <table class="data-table">
      <tr><th>Note</th><th>Level</th><th>Backlinks</th><th>Tags</th></tr>
      ${snapshot.revival_candidates.slice(0, 10).map(r =>
        `<tr><td>${escapeHtml(r.title)}</td><td><span class="badge ${r.level}">${r.level}</span></td><td>${r.backlinks}</td><td>${r.tags}</td></tr>`
      ).join('\n      ')}
    </table>
  </section>` : ''}

  <!-- Open Catalysts -->
  ${snapshot.open_catalysts.length > 0 ? `<section>
    <h2>Open Catalyst Questions</h2>
    <ul class="catalyst-list">
      ${snapshot.open_catalysts.map(c =>
        `<li><span class="badge catalyst-${c.category}">${c.category}</span> ${escapeHtml(c.question)}${c.context ? `<br><small class="muted">${escapeHtml(c.context)}</small>` : ''}</li>`
      ).join('\n      ')}
    </ul>
  </section>` : ''}

  <footer>
    <p>Generated by <a href="https://github.com/GuideThomas/obsidian-intelligence">Obsidian Intelligence</a></p>
  </footer>
</div>

<script>
const REPORT_DATA = ${JSON.stringify({
  engagement: engagement.distribution,
  folders: snapshot.folder_activity.slice(0, 15)
})};

// Engagement Donut Chart
try {
  const ctx1 = document.getElementById('engagementChart').getContext('2d');
  new Chart(ctx1, {
    type: 'doughnut',
    data: {
      labels: REPORT_DATA.engagement.map(e => e.level),
      datasets: [{
        data: REPORT_DATA.engagement.map(e => e.count),
        backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#6b7280'],
        borderColor: '#1a1a2e',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e2e8f0' } }
      }
    }
  });
} catch (e) { /* Chart.js not loaded - noscript fallback visible */ }

// Folder Activity Bar Chart
try {
  const ctx2 = document.getElementById('folderChart').getContext('2d');
  new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: REPORT_DATA.folders.map(f => f.folder.length > 20 ? '...' + f.folder.slice(-18) : f.folder),
      datasets: [
        {
          label: 'Active (7d)',
          data: REPORT_DATA.folders.map(f => f.active_7d),
          backgroundColor: '#22c55e'
        },
        {
          label: 'Total',
          data: REPORT_DATA.folders.map(f => f.total),
          backgroundColor: '#334155'
        }
      ]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      scales: {
        x: { stacked: false, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#e2e8f0' }, grid: { display: false } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e2e8f0' } }
      }
    }
  });
} catch (e) { /* Chart.js not loaded */ }
</script>
</body>
</html>`;
}

// Health score: weighted sum of 4 factors, each 0-25 points.
// Not very scientific but gives a reasonable at-a-glance metric.
function calculateHealthScore(snapshot) {
  const t = snapshot.totals;
  const dist = {};
  for (const e of snapshot.engagement.distribution) {
    dist[e.level] = e.count;
  }
  const total = t.notes || 1;
  const factors = [];

  // Factor 1: Orphan ratio (0-25 points)
  const orphanRatio = t.orphans / total;
  const orphanScore = Math.max(0, 25 - Math.round(orphanRatio * 100));
  factors.push({
    label: 'Connectivity',
    detail: `${t.orphans} orphans (${(orphanRatio * 100).toFixed(1)}%)`,
    status: orphanRatio < 0.1 ? 'good' : orphanRatio < 0.25 ? 'warning' : 'bad'
  });

  // Factor 2: Broken link ratio (0-25 points)
  const brokenRatio = t.links > 0 ? t.broken_links / t.links : 0;
  const brokenScore = Math.max(0, 25 - Math.round(brokenRatio * 250));
  factors.push({
    label: 'Link Integrity',
    detail: `${t.broken_links} broken of ${t.links} (${(brokenRatio * 100).toFixed(1)}%)`,
    status: brokenRatio < 0.05 ? 'good' : brokenRatio < 0.15 ? 'warning' : 'bad'
  });

  // Factor 3: Active engagement (0-25 points)
  const activeRatio = (dist.active || 0) / total;
  const moderateRatio = (dist.moderate || 0) / total;
  const engagementScore = Math.min(25, Math.round((activeRatio * 100) + (moderateRatio * 50)));
  factors.push({
    label: 'Engagement',
    detail: `${dist.active || 0} active, ${dist.moderate || 0} moderate`,
    status: activeRatio > 0.1 ? 'good' : activeRatio > 0.03 ? 'warning' : 'bad'
  });

  // Factor 4: Tag coverage (0-25 points)
  const tagRatio = t.tags > 0 ? Math.min(t.tags / total, 1) : 0;
  const tagScore = Math.round(tagRatio * 25);
  factors.push({
    label: 'Tag Coverage',
    detail: `${t.tags} tags across ${total} notes`,
    status: tagRatio > 0.3 ? 'good' : tagRatio > 0.1 ? 'warning' : 'bad'
  });

  const score = Math.min(100, orphanScore + brokenScore + engagementScore + tagScore);
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 75 ? 'Healthy' : score >= 50 ? 'Needs Attention' : 'Needs Work';

  return { score, color, label, factors };
}

function buildTagCloud(tags) {
  if (!tags || tags.length === 0) return '<p class="muted">No tags found.</p>';

  const maxCount = Math.max(...tags.map(t => t.count));
  return tags.slice(0, 30).map(tag => {
    const size = 0.7 + (tag.count / maxCount) * 1.3;
    const opacity = 0.5 + (tag.count / maxCount) * 0.5;
    return `<span class="tag" style="font-size: ${size}em; opacity: ${opacity}">#${escapeHtml(tag.name)} <sup>${tag.count}</sup></span>`;
  }).join(' ');
}

function buildCollapsibleSection(title, summary, content) {
  return `<section>
    <details>
      <summary><h2 style="display:inline">${title}</h2> <span class="muted">${summary}</span></summary>
      ${content}
    </details>
  </section>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getCSS() {
  return `
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --accent: #3b82f6;
  --green: #22c55e;
  --yellow: #f59e0b;
  --red: #ef4444;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --surface2: #f1f5f9;
    --text: #1e293b;
    --text-muted: #64748b;
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  padding: 2rem;
}

.container { max-width: 1000px; margin: 0 auto; }

header { margin-bottom: 2rem; }
h1 { font-size: 1.8rem; font-weight: 700; }
h2 { font-size: 1.3rem; font-weight: 600; margin-bottom: 1rem; color: var(--text); }
.subtitle { color: var(--text-muted); margin-top: 0.25rem; }
.muted { color: var(--text-muted); font-size: 0.9rem; }

section { margin-bottom: 2.5rem; }

/* Cards */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}
.card {
  background: var(--surface);
  border-radius: 12px;
  padding: 1.25rem;
  text-align: center;
}
.card-value { font-size: 2rem; font-weight: 700; color: var(--accent); }
.card-value.warn { color: var(--yellow); }
.card-label { color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem; }

/* Health */
.health { background: var(--surface); border-radius: 12px; padding: 1.5rem; }
.health-bar-container {
  background: var(--surface2);
  border-radius: 999px;
  height: 12px;
  overflow: hidden;
  margin: 1rem 0;
}
.health-bar { height: 100%; border-radius: 999px; transition: width 0.5s; }
.health-score { font-size: 1.5rem; font-weight: 700; }
.health-label { font-size: 1rem; font-weight: 400; color: var(--text-muted); }
.health-factors { list-style: none; margin-top: 1rem; }
.health-factors li { padding: 0.25rem 0; padding-left: 1.5rem; position: relative; }
.health-factors li::before { content: ''; position: absolute; left: 0; top: 0.6rem; width: 8px; height: 8px; border-radius: 50%; }
.health-factors li.good::before { background: var(--green); }
.health-factors li.warning::before { background: var(--yellow); }
.health-factors li.bad::before { background: var(--red); }

/* Charts */
.chart-section { background: var(--surface); border-radius: 12px; padding: 1.5rem; }
.chart-wrapper { max-width: 500px; margin: 0 auto; }

/* Tables */
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--surface2);
}
.data-table th { color: var(--text-muted); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
.data-table tr:hover td { background: var(--surface2); }

/* Tags */
.tag-cloud { line-height: 2.2; }
.tag {
  display: inline-block;
  background: var(--surface);
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
  margin: 0.15rem;
  color: var(--accent);
}
.tag sup { color: var(--text-muted); font-size: 0.7em; }

/* Badges */
.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}
.badge.active { background: #16a34a22; color: var(--green); }
.badge.moderate { background: #3b82f622; color: var(--accent); }
.badge.dormant { background: #f59e0b22; color: var(--yellow); }
.badge.archived { background: #6b728022; color: var(--text-muted); }
.badge.catalyst-connection { background: #3b82f622; color: var(--accent); }
.badge.catalyst-gap { background: #f59e0b22; color: var(--yellow); }
.badge.catalyst-deepening { background: #8b5cf622; color: #a78bfa; }
.badge.catalyst-contradiction { background: #ef444422; color: var(--red); }

/* Catalysts */
.catalyst-list { list-style: none; }
.catalyst-list li { padding: 0.75rem 0; border-bottom: 1px solid var(--surface2); }

/* Details/Summary */
details { background: var(--surface); border-radius: 12px; padding: 1rem 1.5rem; }
summary { cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary h2 { display: inline; }

/* Footer */
footer { text-align: center; color: var(--text-muted); margin-top: 3rem; padding: 1rem 0; border-top: 1px solid var(--surface2); }
footer a { color: var(--accent); text-decoration: none; }
footer a:hover { text-decoration: underline; }

@media (max-width: 640px) {
  body { padding: 1rem; }
  .cards { grid-template-columns: repeat(2, 1fr); }
  .card-value { font-size: 1.5rem; }
}
`;
}

module.exports = { generateReport, buildHTML, calculateHealthScore };
