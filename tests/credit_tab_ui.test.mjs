import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must be a dedicated Credits section renderer`);
  const parametersOpen = source.indexOf('(', start);
  const parametersClose = matchingDelimiter(source, parametersOpen);
  const open = source.indexOf('{', parametersClose);
  assert.notEqual(open, -1, `${name} must have a function body`);
  const close = matchingDelimiter(source, open);
  return source.slice(open + 1, close);
}

function skipQuoted(source, start) {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === quote) return index + 1;
  }
  assert.fail(`unterminated ${quote} string in renderer source`);
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) index += 1;
    else if (source.startsWith('//', index)) {
      index = source.indexOf('\n', index + 2);
      if (index === -1) return source.length;
    } else if (source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      assert.notEqual(close, -1, 'unterminated block comment in renderer source');
      index = close + 2;
    } else break;
  }
  return index;
}

function matchingDelimiter(source, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const close = pairs[source[open]];
  assert.ok(close, `expected an opening delimiter at offset ${open}`);
  const stack = [close];
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === "'" || source[index] === '"' || source[index] === '`') {
      index = skipQuoted(source, index) - 1;
    } else if (source.startsWith('//', index) || source.startsWith('/*', index)) {
      index = skipTrivia(source, index) - 1;
    } else if (pairs[source[index]]) {
      stack.push(pairs[source[index]]);
    } else if (source[index] === stack.at(-1)) {
      stack.pop();
      if (!stack.length) return index;
    }
  }
  assert.fail(`unterminated ${source[open]} expression in renderer source`);
}

function splitTopLevel(source) {
  const parts = [];
  let start = 0;
  const stack = [];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "'" || source[index] === '"' || source[index] === '`') {
      index = skipQuoted(source, index) - 1;
    } else if (source.startsWith('//', index) || source.startsWith('/*', index)) {
      index = skipTrivia(source, index) - 1;
    } else if (pairs[source[index]]) {
      stack.push(pairs[source[index]]);
    } else if (source[index] === stack.at(-1)) {
      stack.pop();
    } else if (source[index] === ',' && !stack.length) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function parseCall(expression, callee) {
  const source = expression.trim().replace(/;$/, '').trim();
  if (!source.startsWith(callee)) return null;
  let open = skipTrivia(source, callee.length);
  if (source[open] !== '(') return null;
  const close = matchingDelimiter(source, open);
  if (source.slice(close + 1).trim()) return null;
  return splitTopLevel(source.slice(open + 1, close));
}

function stringLiteral(expression) {
  const match = expression.trim().match(/^(['"])(.*)\1$/s);
  return match?.[2] ?? null;
}

function classTokens(properties) {
  const className = objectProperties(properties)?.get('class');
  return new Set((className ? staticStringValue(className) ?? '' : '')
    .split(/\s+/).filter(Boolean));
}

function topLevelSeparator(source, separator) {
  const stack = [];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "'" || source[index] === '"' || source[index] === '`') {
      index = skipQuoted(source, index) - 1;
    } else if (source.startsWith('//', index) || source.startsWith('/*', index)) {
      index = skipTrivia(source, index) - 1;
    } else if (pairs[source[index]]) {
      stack.push(pairs[source[index]]);
    } else if (source[index] === stack.at(-1)) {
      stack.pop();
    } else if (source[index] === separator && !stack.length) {
      return index;
    }
  }
  return -1;
}

function objectProperties(expression) {
  const source = expression.trim();
  if (source[0] !== '{') return null;
  const close = matchingDelimiter(source, 0);
  if (source.slice(close + 1).trim()) return null;
  const properties = new Map();
  for (const entry of splitTopLevel(source.slice(1, close))) {
    if (!entry) continue;
    const separator = topLevelSeparator(entry, ':');
    if (separator === -1) return null;
    const rawKey = entry.slice(0, separator).trim();
    const key = stringLiteral(rawKey)
      ?? (/^[A-Za-z_$][\w$-]*$/.test(rawKey) ? rawKey : null);
    if (!key) return null;
    properties.set(key, entry.slice(separator + 1).trim());
  }
  return properties;
}

function staticStringValue(expression) {
  const source = expression.trim();
  if (!["'", '"', '`'].includes(source[0])) return null;
  if (skipQuoted(source, 0) !== source.length || (source[0] === '`' && source.includes('${'))) {
    return null;
  }
  return source.slice(1, -1);
}

function isStructurallyVisible(node) {
  const properties = objectProperties(node.properties);
  if (!properties || properties.has('hidden') || properties.has('aria-hidden')
    || node.classes.has('hidden')) return false;
  if (!properties.has('style')) return true;
  const style = staticStringValue(properties.get('style'));
  return style !== null && !/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(style);
}

function parseElNode(expression) {
  const args = parseCall(expression, 'el');
  if (!args || args.length < 2) return null;
  const tag = stringLiteral(args[0]);
  if (!tag) return null;
  return {
    tag,
    properties: args[1],
    classes: classTokens(args[1]),
    children: args.slice(2),
  };
}

function embeddedElNodes(expression) {
  const nodes = [];
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === "'" || expression[index] === '"' || expression[index] === '`') {
      index = skipQuoted(expression, index) - 1;
    } else if (expression.startsWith('//', index) || expression.startsWith('/*', index)) {
      index = skipTrivia(expression, index) - 1;
    } else if (expression.startsWith('el', index)
      && !/[\w$]/.test(expression[index - 1] ?? '')
      && !/[\w$]/.test(expression[index + 2] ?? '')) {
      const open = skipTrivia(expression, index + 2);
      if (expression[open] !== '(') continue;
      const close = matchingDelimiter(expression, open);
      const node = parseElNode(expression.slice(index, close + 1));
      if (node) nodes.push(node);
    }
  }
  return nodes;
}

function topLevelReturn(body) {
  const returns = [];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "'" || body[index] === '"' || body[index] === '`') {
      index = skipQuoted(body, index) - 1;
    } else if (body.startsWith('//', index) || body.startsWith('/*', index)) {
      index = skipTrivia(body, index) - 1;
    } else if (pairs[body[index]]) {
      stack.push(pairs[body[index]]);
    } else if (body[index] === stack.at(-1)) {
      stack.pop();
    } else if (!stack.length && body.startsWith('return', index)
      && !/[\w$]/.test(body[index - 1] ?? '') && !/[\w$]/.test(body[index + 6] ?? '')) {
      const expressionStart = skipTrivia(body, index + 6);
      assert.equal(body.slice(expressionStart, expressionStart + 2), 'el',
        'the primary renderer must return its DOM-builder expression directly');
      const open = skipTrivia(body, expressionStart + 2);
      const close = matchingDelimiter(body, open);
      returns.push(body.slice(expressionStart, close + 1));
      index = close;
    }
  }
  assert.equal(returns.length, 1,
    'the primary renderer must have one unambiguous top-level DOM-builder return');
  return returns[0];
}

function translationKeys(node) {
  const keys = new Set();
  for (const child of node.children) {
    const childNode = parseElNode(child);
    if (childNode) {
      for (const key of translationKeys(childNode)) keys.add(key);
      continue;
    }
    const call = parseCall(child, 't');
    const key = call?.length === 1 ? stringLiteral(call[0]) : null;
    if (key) keys.add(key);
  }
  return keys;
}

function visibleTranslationKeys(node) {
  const keys = new Set();
  if (!isStructurallyVisible(node)) return keys;
  for (const child of node.children) {
    const childNode = parseElNode(child);
    if (childNode) {
      for (const key of visibleTranslationKeys(childNode)) keys.add(key);
      continue;
    }
    const call = parseCall(child, 't');
    const key = call?.length === 1 ? stringLiteral(call[0]) : null;
    if (key) keys.add(key);
  }
  return keys;
}

function visibleOutputTranslationKeys(node) {
  const keys = new Set();
  if (!isStructurallyVisible(node)) return keys;
  if (['output', 'span', 'strong', 'dt'].includes(node.tag)) {
    for (const key of visibleTranslationKeys(node)) keys.add(key);
  }
  for (const child of node.children) {
    const childNode = parseElNode(child);
    if (childNode) {
      for (const key of visibleOutputTranslationKeys(childNode)) keys.add(key);
    }
  }
  return keys;
}

function descendantTags(node) {
  const tags = [];
  for (const child of node.children) {
    const childNode = parseElNode(child);
    if (!childNode) continue;
    tags.push(childNode.tag, ...descendantTags(childNode));
  }
  return tags;
}

function visibleDescendantTags(node) {
  const tags = [];
  for (const child of node.children) {
    const childNode = parseElNode(child);
    if (!childNode || !isStructurallyVisible(childNode)) continue;
    tags.push(childNode.tag, ...visibleDescendantTags(childNode));
  }
  return tags;
}

function provablyBeforeDisclosure(expression) {
  if (parseCall(expression, 't') || stringLiteral(expression) !== null
    || /^(?:null|undefined|false|true|-?\d+(?:\.\d+)?)$/.test(expression.trim())) return true;
  const node = parseElNode(expression);
  return !!node && node.tag !== 'details'
    && node.children.every(provablyBeforeDisclosure);
}

function assertDirectFactsContainer(source, { name, sectionClass, factsClass, copyKeys, factKeys }) {
  const body = functionBody(source, name);
  const section = parseElNode(topLevelReturn(body));

  assert.ok(section && ['section', 'div'].includes(section.tag)
    && section.classes.has(sectionClass),
  `${name} must directly return its visible ${sectionClass} primary section`);
  assert.ok(isStructurallyVisible(section),
    `${sectionClass} must be structurally visible`);
  const facts = section.children.map(parseElNode)
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node?.classes.has(factsClass));
  assert.equal(facts.length, 1,
    `${name} must return ${factsClass} as one direct child of ${sectionClass}`);
  const { node: factsNode, index: factsIndex } = facts[0];
  assert.ok(isStructurallyVisible(factsNode),
    `${factsClass} must be structurally visible`);
  assert.ok(section.children.slice(0, factsIndex).every(provablyBeforeDisclosure),
    `${factsClass} must be a visible child before any disclosure or opaque helper output`);
  const embeddedFacts = factsNode.children.flatMap(embeddedElNodes);
  const factTags = [
    ...descendantTags(factsNode),
    ...embeddedFacts.flatMap(node => [node.tag, ...descendantTags(node)]),
  ];
  assert.ok(!factTags.includes('details'),
    `${factsClass} must keep its required outputs outside details`);
  assert.ok([
    ...visibleDescendantTags(factsNode),
    ...embeddedFacts.filter(isStructurallyVisible)
      .flatMap(node => [node.tag, ...visibleDescendantTags(node)]),
  ].some(tag => tag === 'strong' || tag === 'output'),
    `${factsClass} must directly build visible value output nodes`);

  const renderedKeys = translationKeys(section);
  for (const node of embeddedFacts) {
    for (const key of translationKeys(node)) renderedKeys.add(key);
  }
  for (const key of copyKeys) {
    assert.ok(renderedKeys.has(key),
      `${name} must render ${key} in its returned ${sectionClass} DOM tree`);
  }
  const renderedFactKeys = visibleOutputTranslationKeys(factsNode);
  for (const node of embeddedFacts) {
    for (const key of visibleOutputTranslationKeys(node)) renderedFactKeys.add(key);
  }
  for (const key of factKeys) {
    assert.ok(renderedFactKeys.has(key),
      `${name} must render ${key} in a visible output node inside ${factsClass}`);
  }
}

function assertCreditFactsContractGuards() {
  const contract = name => ({
    name,
    sectionClass: 'primary-section',
    factsClass: 'primary-facts',
    copyKeys: ['sectionTitle', 'factLabel'],
    factKeys: ['factLabel'],
  });
  const visible = facts => `
    el('h3', {}, t('sectionTitle')),
    ${facts},
    el('details', {}, el('summary', {}, t('assessmentDetails')))`;
  const facts = `el('div', { class: 'primary-facts' },
    el('span', {}, t('factLabel')), el('strong', {}, '42'))`;

  assert.doesNotThrow(() => assertDirectFactsContainer(`
    function validPrimaryRenderer() {
      return el('section', { class: 'primary-section' }, ${visible(facts)});
    }
  `, contract('validPrimaryRenderer')));

  assert.throws(() => assertDirectFactsContainer(`
    function nestedFactsRenderer() {
      return el('section', { class: 'primary-section' },
        el('h3', {}, t('sectionTitle')),
        el('details', {}, ${facts}));
    }
  `, contract('nestedFactsRenderer')), /one direct child/,
  'facts nested in a closed details element must not satisfy the primary-facts contract');

  assert.throws(() => assertDirectFactsContainer(`
    function unreachableFactsRenderer() {
      return el('section', { class: 'primary-section' },
        el('h3', {}, t('sectionTitle')), renderFacts());
      ${facts};
    }
  `, contract('unreachableFactsRenderer')), /one direct child/,
  'facts code after the returned tree must not satisfy the primary-facts contract');

  assert.throws(() => assertDirectFactsContainer(`
    function disclosureFirstRenderer() {
      return el('section', { class: 'primary-section' },
        el('details', {}, el('summary', {}, t('assessmentDetails'))),
        el('h3', {}, t('sectionTitle')), ${facts});
    }
  `, contract('disclosureFirstRenderer')), /before any disclosure or opaque helper output/,
  'primary facts must precede disclosures in the returned DOM-builder tree');

  assert.throws(() => assertDirectFactsContainer(`
    function hiddenRootRenderer() {
      return el('section', { class: 'primary-section', hidden: true }, ${visible(facts)});
    }
  `, contract('hiddenRootRenderer')), /primary-section must be structurally visible/,
  'a hidden returned section must not satisfy the primary-facts contract');

  assert.throws(() => assertDirectFactsContainer(`
    function hiddenFactsRenderer() {
      return el('section', { class: 'primary-section' }, ${visible(`el('div', {
        class: 'primary-facts', 'aria-hidden': 'true'
      }, el('span', {}, t('factLabel')), el('strong', {}, '42'))`)});
    }
  `, contract('hiddenFactsRenderer')), /primary-facts must be structurally visible/,
  'an aria-hidden facts container must not satisfy the primary-facts contract');

  assert.throws(() => assertDirectFactsContainer(`
    function hiddenOutputRenderer() {
      return el('section', { class: 'primary-section' }, ${visible(`el('div', {
        class: 'primary-facts'
      }, el('span', {}, t('factLabel')), el('strong', { hidden: true }, '42'))`)});
    }
  `, contract('hiddenOutputRenderer')), /visible value output nodes/,
  'a hidden required output node must not satisfy the primary-facts contract');

  assert.throws(() => assertDirectFactsContainer(`
    function displayNoneRenderer() {
      return el('section', { class: 'primary-section', style: 'display: none' }, ${visible(facts)});
    }
  `, contract('displayNoneRenderer')), /primary-section must be structurally visible/,
  'a display:none returned section must not satisfy the primary-facts contract');

  assert.throws(() => assertDirectFactsContainer(`
    function visibilityHiddenRenderer() {
      return el('section', { class: 'primary-section' }, ${visible(`el('div', {
        class: 'primary-facts'
      }, el('span', { style: 'visibility:hidden' }, t('factLabel')), el('strong', {}, '42'))`)});
    }
  `, contract('visibilityHiddenRenderer')), /factLabel.*visible output/,
  'a visibility:hidden required output node must not satisfy the primary-facts contract');
}

test('dedicated credit tab owns decisions, relevant investments, and amortization corridor', async () => {
  const [app, navigation, i18n, css] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/ui/command_center.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8'),
  ]);

  assert.match(app, /'history', 'credits', 'construction'/);
  assert.match(app, /credits: 'tabCredits'/);
  assert.match(navigation, /'history', 'credits', 'construction'/);
  assert.match(app, /case 'credits': return renderCredits\(\)/);
  assert.match(app, /function renderCredits\(\)/);
  assert.match(app, /rankRelevantCreditOpportunities/);
  assert.match(app, /amortizationCorridor/);
  assert.match(app, /forecastElectronicsPrices/);
  assert.match(app, /futureExchangePath/);
  assert.doesNotMatch(app.match(/function renderRepublicHistory\(\)[\s\S]*?\n}\n/)?.[0] ?? '',
    /renderEconomicDecisionSurface/);
  assert.match(css, /\.credit-center/);
  assert.match(css, /\.amortization-corridor/);

  for (const key of [
    'tabCredits', 'creditCenterTitle', 'creditCenterHint', 'creditActionTitle',
    'creditActiveContracts', 'creditHypotheticalTitle', 'creditAmount', 'creditTermYears',
    'creditRelevantInvestments', 'creditNoRelevantElectronics', 'creditBreakEvenBase',
    'creditBreakEvenAdverse', 'creditExitCurrency', 'creditAssessmentAdverse',
    'creditAssessmentBaseOnly', 'creditAmortizationTitle', 'creditHistoricalBoundary',
    'creditForecastEvidence', 'creditShipResidualZero', 'creditTakeLoanAction',
    'creditNoLoanAction', 'creditScenarioBase', 'creditScenarioFavorable', 'creditScenarioAdverse',
    'creditHistoricalTitle', 'creditHistoricalBalance', 'creditHistoricalInterest',
    'creditAlternateExits', 'creditRequiredPrincipal', 'loanPenalty', 'creditLoanPreviewHint',
    'creditFinancingTerms', 'creditHypotheticalTerms', 'creditActiveTerms',
  ]) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2,
      `${key} must be translated in both languages`);
  }
});

test('credits keeps current facts visible before progressively disclosed experiments and evidence', async () => {
  assertCreditFactsContractGuards();
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const credits = functionBody(app, 'renderCredits');
  const sectionNames = [
    'renderCreditDataStatus',
    'renderActiveCreditPosition',
    'renderNewCreditCalculator',
    'renderOptionalElectronicsStrategy',
    'renderCreditHistoryEvidence',
  ];
  const positions = sectionNames.map(name => credits.indexOf(`${name}(`));

  assert.ok(positions.every(position => position >= 0),
    'renderCredits must compose the five dedicated sections');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions,
    'current credit facts must precede the optional electronics experiment and history evidence');
  assert.doesNotMatch(app, /t\('creditTakeLoanAction'\)/,
    'no Credits renderer may present an imperative borrowing recommendation');

  assertDirectFactsContainer(app, {
    name: 'renderCreditDataStatus', sectionClass: 'credit-data-status',
    factsClass: 'credit-data-status-facts',
    copyKeys: ['creditDataStatusTitle', 'creditDataActiveCount'],
    factKeys: ['creditDataActiveCount'],
  });
  assertDirectFactsContainer(app, {
    name: 'renderActiveCreditPosition', sectionClass: 'active-credit-card',
    factsClass: 'active-credit-facts',
    copyKeys: ['creditActivePositionTitle', 'creditTotalRepayment', 'creditMaximumDailyPayment',
      'creditExpectedRealRate'],
    factKeys: ['creditTotalRepayment', 'creditMaximumDailyPayment', 'creditExpectedRealRate'],
  });
  assertDirectFactsContainer(app, {
    name: 'renderNewCreditCalculator', sectionClass: 'credit-calculator',
    factsClass: 'credit-calculator-results',
    copyKeys: ['creditNewCalculatorTitle', 'creditAmount', 'creditTotalRepayment', 'creditAdditionalCost',
      'creditMaximumDailyPayment', 'creditExpectedRealRate'],
    factKeys: ['creditTotalRepayment', 'creditAdditionalCost', 'creditMaximumDailyPayment',
      'creditExpectedRealRate'],
  });
});
