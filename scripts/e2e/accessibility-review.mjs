import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

// Scan the complete rendered page. No exclusions or disabled rules hide failures.
export async function reviewAccessibility(page, name, report) {
  // React Native activates the dialog role and focus trap when its fade ends.
  // Scanning a partially transparent transition produces misleading contrast failures.
  if (await page.locator('[aria-modal="true"]').filter({ visible: true }).count()) {
    await page.getByRole('dialog').waitFor();
  }
  const result = await new AxeBuilder({ page }).analyze();
  if (result.violations.length) await writeFile('.e2e/accessibility-failure.json', JSON.stringify(result.violations, null, 2));
  const summarize = rules => rules.map(rule => ({
    id: rule.id,
    impact: rule.impact,
    targets: rule.nodes.map(node => node.target),
  }));
  report.accessibility ??= [];
  report.accessibility.push({ name, violations: summarize(result.violations), needsManualReview: summarize(result.incomplete) });
  assert.deepEqual(result.violations.map(rule => `${rule.id}: ${rule.nodes.length}`), [], `Accessibility: ${name}`);
}
