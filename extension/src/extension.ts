import * as vscode from 'vscode';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

let status: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = 'Aftermath';
  status.tooltip = 'Independent verification for agent-written code';
  status.command = 'aftermath.showStatus';
  status.show();

  const provider = new AftermathTreeProvider();
  vscode.window.registerTreeDataProvider('aftermath.panel', provider);

  context.subscriptions.push(
    status,
    vscode.commands.registerCommand('aftermath.verify', () => runCli(['verify'], provider)),
    vscode.commands.registerCommand('aftermath.baseline', () => runCli(['baseline'], provider)),
    vscode.commands.registerCommand('aftermath.compareBaseline', () =>
      runCli(['compare', 'latest'], provider),
    ),
    vscode.commands.registerCommand('aftermath.showStatus', () => runCli(['status'], provider)),
    vscode.commands.registerCommand('aftermath.prepareRepair', async () => {
      const latest = latestRunNumber(workspaceRoot());
      if (!latest) {
        vscode.window.showWarningMessage(
          'No Aftermath runs yet. Create a baseline, then run Aftermath: Verify Repository.',
        );
        return;
      }
      await runCli(['repair-context', 'latest'], provider);
    }),
    vscode.commands.registerCommand('aftermath.showLatestReceipt', async () => {
      await openLatestArtifact(provider, 'md');
    }),
    vscode.commands.registerCommand('aftermath.showLatestHtmlReceipt', async () => {
      await openLatestArtifact(provider, 'html');
    }),
  );

  const root = workspaceRoot();
  if (root) {
    const latest = latestRunNumber(root);
    if (latest) updateStatusFromReceipt(root, latest);
    else {
      status.text = 'Aftermath · idle';
      status.tooltip = 'No runs yet — verify after agent changes';
    }
  }
}

export function deactivate() {}

async function openLatestArtifact(
  provider: AftermathTreeProvider,
  kind: 'md' | 'html',
): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }
  const latest = latestRunNumber(root);
  if (!latest) {
    vscode.window.showInformationMessage(
      'No Aftermath receipts yet. Run Aftermath: Verify Repository after agent changes.',
    );
    return;
  }
  const runDir = join(root, '.aftermath', 'runs', String(latest).padStart(4, '0'));
  const preferred =
    kind === 'html' ? join(runDir, 'receipt.html') : join(runDir, 'receipt.md');
  const fallback =
    kind === 'html' ? join(runDir, 'receipt.md') : join(runDir, 'receipt.html');

  let path = preferred;
  if (!existsSync(path)) {
    if (kind === 'html') {
      // Regenerate HTML via CLI if missing
      try {
        await runCli(['receipt', 'latest', '--html'], provider);
      } catch {
        // fall through
      }
    }
    if (!existsSync(path) && existsSync(fallback)) path = fallback;
  }

  if (!existsSync(path)) {
    vscode.window.showWarningMessage('Latest receipt file is missing.');
    return;
  }

  if (path.endsWith('.html')) {
    await vscode.env.openExternal(vscode.Uri.file(path));
  } else {
    const doc = await vscode.workspace.openTextDocument(path);
    await vscode.window.showTextDocument(doc, { preview: true });
  }
  updateStatusFromReceipt(root, latest);
  provider.refresh();
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function latestRunNumber(root: string | undefined): number | null {
  if (!root) return null;
  const runs = join(root, '.aftermath', 'runs');
  if (!existsSync(runs)) return null;
  const nums = readdirSync(runs)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return Math.max(...nums);
}

function updateStatusFromReceipt(root: string, run: number) {
  try {
    const path = join(root, '.aftermath', 'runs', String(run).padStart(4, '0'), 'receipt.json');
    const receipt = JSON.parse(readFileSync(path, 'utf8')) as {
      verdict: string;
      findings: unknown[];
      repairAttempts?: number;
      baseline?: { present?: boolean };
    };
    const findings = receipt.findings?.length ?? 0;
    if (receipt.verdict === 'verified') status.text = 'Aftermath ✓';
    else if (findings > 0) status.text = `Aftermath ⚠ ${findings}`;
    else status.text = `Aftermath · ${receipt.verdict}`;
    const attempts = receipt.repairAttempts ?? 0;
    const baseline = receipt.baseline?.present ? 'baseline·yes' : 'baseline·no';
    status.tooltip = `Verdict: ${receipt.verdict} · findings: ${findings} · ${baseline}${
      attempts > 0 ? ` · repair attempts: ${attempts}` : ''
    }`;
  } catch {
    status.text = 'Aftermath';
  }
}

async function runCli(args: string[], provider: AftermathTreeProvider) {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }
  const localCli = join(root, 'dist', 'cli', 'index.js');
  const cmd = existsSync(localCli) ? process.execPath : 'aftermath';
  const finalArgs = existsSync(localCli) ? [localCli, ...args] : args;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Aftermath ${args[0]}`,
      cancellable: true,
    },
    async (_progress, token) => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, finalArgs, {
          cwd: root,
          shell: false,
          windowsHide: true,
        });
        let out = '';
        child.stdout.on('data', (d) => (out += d.toString()));
        child.stderr.on('data', (d) => (out += d.toString()));
        token.onCancellationRequested(() => child.kill('SIGTERM'));
        child.on('error', reject);
        child.on('close', (code) => {
          const channel = vscode.window.createOutputChannel('Aftermath');
          channel.append(out);
          channel.show(true);
          if (
            code === 0 ||
            args[0] === 'verify' ||
            args[0] === 'compare' ||
            args[0] === 'status' ||
            args[0] === 'receipt'
          ) {
            resolve();
          } else reject(new Error(`aftermath exited ${code}`));
        });
      });
    },
  );
  const latest = latestRunNumber(root);
  if (latest) updateStatusFromReceipt(root, latest);
  provider.refresh();
}

class AftermathTreeProvider implements vscode.TreeDataProvider<AftermathItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AftermathItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AftermathItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AftermathItem): AftermathItem[] {
    const root = workspaceRoot();
    if (!root) {
      return [
        new AftermathItem(
          'Open a workspace folder to use Aftermath',
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }
    if (element) {
      if (element.id === 'findings') return loadFindings(root);
      if (element.id === 'runs') return loadRuns(root);
      return [];
    }
    const latest = latestRunNumber(root);
    const latestMeta = latest ? readLatestMeta(root, latest) : null;
    const baselineOk = existsSync(join(root, '.aftermath', 'baseline.json'));
    return [
      new AftermathItem(
        latest
          ? `Latest · #${latest} · ${latestMeta?.verdict ?? 'unknown'}`
          : 'Latest · none — run Verify after agent work',
        vscode.TreeItemCollapsibleState.None,
        'latest',
      ),
      new AftermathItem(
        `Findings · ${latestMeta?.findingCount ?? 0}${
          latestMeta?.errorCount ? ` (${latestMeta.errorCount} errors)` : ''
        }`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'findings',
      ),
      new AftermathItem(
        baselineOk ? 'Baseline · present' : 'Baseline · missing — create one first',
        vscode.TreeItemCollapsibleState.None,
        'baseline',
      ),
      new AftermathItem(
        `Repair attempts · ${latestMeta?.repairAttempts ?? 0}`,
        vscode.TreeItemCollapsibleState.None,
        'repairs',
      ),
      new AftermathItem('Runs', vscode.TreeItemCollapsibleState.Collapsed, 'runs'),
      new AftermathItem(
        latestMeta?.hasHtml ? 'Open HTML receipt' : 'HTML receipt · generate via Verify',
        vscode.TreeItemCollapsibleState.None,
        'html',
      ),
      new AftermathItem('Receipts folder', vscode.TreeItemCollapsibleState.None, 'receipts'),
    ];
  }
}

class AftermathItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public override id?: string,
  ) {
    super(label, collapsibleState);
    if (id === 'html') {
      this.command = { command: 'aftermath.showLatestHtmlReceipt', title: 'Open HTML' };
    } else if (id === 'latest') {
      this.command = { command: 'aftermath.showLatestReceipt', title: 'Open receipt' };
    } else if (id === 'receipts') {
      const root = workspaceRoot();
      if (root) {
        this.command = {
          command: 'revealFileInOS',
          title: 'Reveal',
          arguments: [vscode.Uri.file(join(root, '.aftermath', 'receipts'))],
        };
      }
    }
  }
}

function readLatestMeta(
  root: string,
  run: number,
): {
  verdict: string;
  findingCount: number;
  errorCount: number;
  repairAttempts: number;
  hasHtml: boolean;
} | null {
  try {
    const pad = String(run).padStart(4, '0');
    const path = join(root, '.aftermath', 'runs', pad, 'receipt.json');
    const receipt = JSON.parse(readFileSync(path, 'utf8')) as {
      verdict: string;
      findings?: Array<{ severity?: string }>;
      repairAttempts?: number;
    };
    const findings = receipt.findings ?? [];
    return {
      verdict: receipt.verdict,
      findingCount: findings.length,
      errorCount: findings.filter((f) => f.severity === 'error').length,
      repairAttempts: receipt.repairAttempts ?? 0,
      hasHtml: existsSync(join(root, '.aftermath', 'runs', pad, 'receipt.html')),
    };
  } catch {
    return null;
  }
}

function loadFindings(root: string): AftermathItem[] {
  const latest = latestRunNumber(root);
  if (!latest) {
    return [
      new AftermathItem(
        'No findings yet — run Aftermath: Verify Repository',
        vscode.TreeItemCollapsibleState.None,
      ),
    ];
  }
  try {
    const path = join(root, '.aftermath', 'runs', String(latest).padStart(4, '0'), 'findings.json');
    const findings = JSON.parse(readFileSync(path, 'utf8')) as Array<{
      code: string;
      title: string;
      message: string;
      relatedFiles?: string[];
      location?: { file: string; line?: number };
    }>;
    if (!findings.length) {
      return [
        new AftermathItem('No findings on latest run', vscode.TreeItemCollapsibleState.None),
      ];
    }
    return findings.map((f) => {
      const loc = f.location
        ? `${f.location.file}${f.location.line != null ? `:${f.location.line}` : ''}`
        : f.relatedFiles?.[0];
      const item = new AftermathItem(
        `${f.code} · ${f.title}`,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = f.message;
      item.tooltip = loc ? `${f.message}\n${loc}` : f.message;
      if (loc) {
        const file = f.location?.file ?? f.relatedFiles![0]!;
        const uri = vscode.Uri.file(join(root, file));
        item.command = {
          command: 'vscode.open',
          title: 'Open',
          arguments:
            f.location?.line != null
              ? [uri, { selection: new vscode.Range(f.location.line - 1, 0, f.location.line - 1, 0) }]
              : [uri],
        };
      }
      return item;
    });
  } catch {
    return [new AftermathItem('Unable to read findings', vscode.TreeItemCollapsibleState.None)];
  }
}

function loadRuns(root: string): AftermathItem[] {
  const runs = join(root, '.aftermath', 'runs');
  if (!existsSync(runs)) {
    return [
      new AftermathItem('No runs stored yet', vscode.TreeItemCollapsibleState.None),
    ];
  }
  return readdirSync(runs)
    .filter((n) => /^\d+$/.test(n))
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, 20)
    .map((n) => {
      const meta = readLatestMeta(root, Number(n));
      const label = meta
        ? `Run #${Number(n)} · ${meta.verdict} · ${meta.findingCount} findings`
        : `Run #${Number(n)}`;
      return new AftermathItem(label, vscode.TreeItemCollapsibleState.None, `run-${n}`);
    });
}
