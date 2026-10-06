/*
  Pablo* — SMALL, READABLE WEBSITE CALCULATOR

  1. Change example prices in PRICES below. Displayed prices and totals update together.
  2. Edit descriptions in pricing.html. If you change bundle contents here, also update
     their descriptions there (e.g. number and duration of included meetings).
  3. No libraries, external requests, cookies or saved browser data.
  4. The brief is generated locally. Copying never sends an enquiry.
*/

const PRICES = {
  base: 650,
  page: 180,
  customDesign: 450,
  copywriting: 220,
  cms: 350,
  form: 120,
  newsletter: 180,
  meeting: 130,       // 60 minutes together + 30 minutes preparation/follow-up.
  workshop: 260,      // 120 minutes together + 60 minutes preparation/follow-up.
  revision: 150,
};

const ADDONS = {
  customDesign: 'Bespoke visual direction',
  copywriting: 'Main-page copywriting',
  cms: 'Editable CMS',
  form: 'Enquiry form',
  newsletter: 'Newsletter signup',
};

const COLLABORATION = {
  async: { label: 'A clear written brief', meetings: 0, workshops: 0, revisions: 0 },
  guided: { label: 'Work it out together', meetings: 2, workshops: 0, revisions: 0 },
  explore: { label: 'Room to explore', meetings: 2, workshops: 1, revisions: 1 },
};

const money = amount => new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}).format(amount);

// Keep the calculation independent of the page so it is easy to understand and test.
function calculateEstimate(selection) {
  const bundle = COLLABORATION[selection.collaboration];
  const lines = [{ label: 'The small beginning', amount: PRICES.base }];
  let workTotal = PRICES.base;

  function addWork(label, amount) {
    if (amount > 0) {
      lines.push({ label, amount });
      workTotal += amount;
    }
  }

  addWork(`${selection.pages} extra page${selection.pages === 1 ? '' : 's'}`, selection.pages * PRICES.page);
  for (const [key, label] of Object.entries(ADDONS)) {
    if (selection[key]) addWork(label, PRICES[key]);
  }

  const extraRevisions = selection.revisions + bundle.revisions;
  addWork(`${extraRevisions} extra revision round${extraRevisions === 1 ? '' : 's'}`, extraRevisions * PRICES.revision);

  const meetings = bundle.meetings + selection.meetings;
  const workshops = bundle.workshops;
  const meetingTotal = meetings * PRICES.meeting + workshops * PRICES.workshop;
  if (meetings) lines.push({ label: `${meetings} meeting${meetings === 1 ? '' : 's'} incl. prep`, amount: meetings * PRICES.meeting });
  if (workshops) lines.push({ label: '2-hour workshop incl. prep', amount: workshops * PRICES.workshop });

  return {
    lines,
    workTotal,
    meetingTotal,
    total: workTotal + meetingTotal,
    pages: 1 + selection.pages,
    meetings,
    workshops,
    liveHours: meetings + workshops * 2,
    preparationHours: meetings * 0.5 + workshops,
    revisions: 1 + extraRevisions,
    collaboration: bundle.label,
  };
}

function bundlePrice(key) {
  const bundle = COLLABORATION[key];
  return bundle.meetings * PRICES.meeting + bundle.workshops * PRICES.workshop + bundle.revisions * PRICES.revision;
}

// Update repeated labels from the one price list, on either page.
function renderPriceLabels() {
  document.querySelectorAll('[data-price]').forEach(element => {
    const key = element.dataset.price;
    element.textContent = (Object.hasOwn(ADDONS, key) ? '+ ' : '') + money(PRICES[key]);
  });
  document.querySelectorAll('[data-bundle]').forEach(element => {
    element.textContent = '+ ' + money(bundlePrice(element.dataset.bundle));
  });
}

function setupCalculator() {
  const form = document.getElementById('project-form');
  if (!form) return; // The homepage only needs its copy button and price labels.

  const quantityNames = ['pages', 'meetings', 'revisions'];
  let currentEstimate;
  let announcementTimer;
  const briefSection = document.getElementById('project-brief');
  const briefText = document.getElementById('brief-content');
  const briefStatus = document.getElementById('brief-status');

  function readSelection() {
    const selection = { collaboration: form.elements.collaboration.value };
    quantityNames.forEach(name => {
      const input = form.elements[name];
      const value = Number(input.value);
      selection[name] = Math.min(Number(input.max), Math.max(Number(input.min), Number.isFinite(value) ? Math.trunc(value) : 0));
    });
    Object.keys(ADDONS).forEach(name => { selection[name] = form.elements[name].checked; });
    return selection;
  }

  function makeBrief(estimate) {
    const lines = estimate.lines.map(line => `- ${line.label}: ${money(line.amount)}`);
    return [
      'Hi Pablo, here is my starting point.',
      '',
      'MY WEBSITE COMBINATION',
      ...lines,
      '',
      `Illustrative one-off estimate: ${money(estimate.total)}`,
      `Making the website: ${money(estimate.workTotal)}`,
      `Time together + preparation/follow-up: ${money(estimate.meetingTotal)}`,
      '',
      `Collaboration: ${estimate.collaboration}`,
      `${estimate.pages} page(s), ${estimate.revisions} revision round(s).`,
      `${estimate.meetings} one-hour meeting(s), ${estimate.workshops} two-hour workshop(s).`,
      `${estimate.liveHours} hour(s) together + ${estimate.preparationHours} hour(s) preparation/follow-up.`,
      '',
      'ABOUT MY PROJECT',
      'What I do: …',
      'What already exists: …',
      'What I want to achieve: …',
      'My timing and budget: …',
      '',
      'Illustrative prototype prices, not a confirmed quote.',
      'Excludes VAT where applicable, domain, hosting and third-party charges.',
      'Scope, feasibility and final price must be agreed before work begins.',
    ].join('\n');
  }

  function render() {
    const selection = readSelection();
    currentEstimate = calculateEstimate(selection);
    const estimate = currentEstimate;
    const receipt = document.getElementById('receipt-lines');
    receipt.replaceChildren();

    estimate.lines.forEach(line => {
      const row = document.createElement('div');
      row.className = 'receipt-line';
      const label = document.createElement('span');
      const amount = document.createElement('span');
      label.textContent = line.label;
      amount.textContent = money(line.amount);
      row.append(label, amount);
      receipt.append(row);
    });

    document.getElementById('total').textContent = money(estimate.total);
    document.getElementById('mobile-total').textContent = money(estimate.total);
    document.getElementById('work-total').textContent = money(estimate.workTotal);
    document.getElementById('meeting-total').textContent = money(estimate.meetingTotal);
    const time = estimate.liveHours ? `${estimate.liveHours}h together + ${estimate.preparationHours}h prep` : 'no scheduled meetings';
    document.getElementById('scope-note').textContent = `${estimate.pages} page${estimate.pages === 1 ? '' : 's'} · ${time} · ${estimate.revisions} revision round${estimate.revisions === 1 ? '' : 's'}`;

    // Disable minus/plus buttons at the limits; direct typing is normalised on change.
    document.querySelectorAll('[data-step]').forEach(button => {
      const input = form.elements[button.dataset.step];
      const value = selection[button.dataset.step];
      button.disabled = Number(button.dataset.delta) < 0 ? value <= Number(input.min) : value >= Number(input.max);
    });

    briefText.value = makeBrief(estimate);
    briefStatus.textContent = '';
    document.getElementById('copy-estimate').textContent = 'Copy my project brief';
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => {
      document.getElementById('estimate-announcement').textContent = `Estimate ${money(estimate.total)}. Website work ${money(estimate.workTotal)}. Collaboration ${money(estimate.meetingTotal)}.`;
    }, 180);
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', render);
  form.addEventListener('change', event => {
    if (quantityNames.includes(event.target.name)) {
      event.target.value = readSelection()[event.target.name];
    }
    render();
  });

  document.querySelectorAll('[data-step]').forEach(button => {
    button.addEventListener('click', () => {
      const name = button.dataset.step;
      const input = form.elements[name];
      input.value = Math.min(Number(input.max), Math.max(Number(input.min), readSelection()[name] + Number(button.dataset.delta)));
      render();
    });
  });

  form.addEventListener('reset', () => {
    // A reset event fires before the browser restores default control values.
    setTimeout(() => {
      briefSection.hidden = true;
      render();
    }, 0);
  });

  document.getElementById('prepare-brief').addEventListener('click', () => {
    briefSection.hidden = false;
    document.getElementById('brief-title').focus({ preventScroll: true });
    briefSection.scrollIntoView({ block: 'start', behavior: 'auto' });
  });

  document.getElementById('copy-estimate').addEventListener('click', async () => {
    // Keep the text available even when the clipboard API is blocked or unavailable.
    const textAtClick = briefText.value;
    try {
      await navigator.clipboard.writeText(textAtClick);
      if (briefText.value === textAtClick) {
        briefStatus.textContent = 'Copied. Add your project details when you paste it.';
      } else {
        briefStatus.textContent = 'Your choices changed while copying. Copy again for the latest estimate.';
      }
    } catch {
      briefText.focus();
      briefText.select();
      briefStatus.textContent = 'Your brief is selected. Use your device’s Copy command.';
    }
  });

  render();

  // Optional browser-agent support; ignored by ordinary browsers.
  // Reads the exact visible estimate. No configuration changes or external actions.
  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    try {
      Promise.resolve(document.modelContext.registerTool({
        name: 'read_website_estimate',
        title: 'Read the current website estimate',
        description: 'Read the visible illustrative estimate, selected scope and cost breakdown. Does not submit an enquiry.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
            throw new Error('Expected an empty object.');
          }
          return { ...currentEstimate, currency: 'EUR', illustrative: true, excludesVAT: true };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* The ordinary calculator works without this optional browser feature. */ }
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
}

function setupHomepageCopy() {
  const button = document.getElementById('copy-brief');
  if (!button) return;
  button.addEventListener('click', async () => {
    const status = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(document.getElementById('brief-text').innerText);
      status.textContent = 'Copied. Paste it into your notes and make it your own.';
      button.textContent = 'Conversation starter copied';
    } catch {
      document.querySelector('.contact-actions details').open = true;
      status.textContent = 'Select and copy the conversation starter below.';
    }
  });
}

// Also allows the pure calculation to be tested in Node without a browser.
if (typeof document !== 'undefined') {
  renderPriceLabels();
  setupCalculator();
  setupHomepageCopy();
}
