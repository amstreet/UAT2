/* ==========================================================================
   Patient Intake Wizard — Timothy Ehrlich, MD
   ==========================================================================
   - State lives in localStorage under INTAKE_DRAFT_KEY.
   - Steps are registered in STEPS; only those whose `when(interests)` returns
     true are presented. Step order is the order they appear in STEPS.
   - Routing is hash-based (#<step-id>). Empty hash routes to the first step.
   - Edit-from-Review uses ?return=review to round-trip back to the review step.
   ========================================================================== */

const INTAKE_DRAFT_KEY = 'intake.draft';

/* ---------- State ---------- */

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(INTAKE_DRAFT_KEY) || '{}'); }
  catch (_) { return {}; }
}
function saveDraft(d) {
  try { localStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(d)); } catch (_) {}
}

/* ---------- Path helpers (mirror admin.html) ---------- */

function getByPath(obj, path) {
  if (obj == null) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    const nextIsIndex = /^\d+$/.test(nextKey);
    if (cursor[key] == null) cursor[key] = nextIsIndex ? [] : {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

/* ---------- Generic form ⇄ state binding ---------- */

// All inputs use `name="<dot.path>"`. Checkboxes → boolean. Radios with the
// same name → string of the checked value. Everything else → string.
function collectForm(formEl) {
  const out = {};
  // Track which radio names we've already set so we don't overwrite.
  const radiosSeen = new Set();
  formEl.querySelectorAll('[name]').forEach(el => {
    const path = el.getAttribute('name');
    if (el.type === 'checkbox') {
      setByPath(out, path, !!el.checked);
    } else if (el.type === 'radio') {
      // For radios, set the path to the checked value (or '' if none).
      if (radiosSeen.has(path)) return;
      radiosSeen.add(path);
      const checked = formEl.querySelector(`input[type="radio"][name="${CSS.escape(path)}"]:checked`);
      setByPath(out, path, checked ? checked.value : '');
    } else {
      setByPath(out, path, el.value);
    }
  });
  return out;
}

function fillForm(formEl, data) {
  if (!data) return;
  formEl.querySelectorAll('[name]').forEach(el => {
    const path = el.getAttribute('name');
    const value = getByPath(data, path);
    if (el.type === 'checkbox') {
      el.checked = !!value;
    } else if (el.type === 'radio') {
      el.checked = (el.value === value);
    } else if (value != null) {
      el.value = value;
    }
  });
}

/* ---------- DOM helpers ---------- */

const $ = (sel) => document.querySelector(sel);
const stepperEl = $('#stepper');
const cardEl = $('#stepCard');
const actionsEl = $('#stepActions');
const toastEl = $('#toast');

function showToast(msg, ms = 2400) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- Step registry ---------- */

const STEPS = [];

function registerStep(step) { STEPS.push(step); }

function getActiveSteps(draft) {
  const interests = (draft.contact && draft.contact.interests) || [];
  return STEPS.filter(s =>
    typeof s.when === 'function' ? s.when(interests, draft) : true
  );
}

/* ---------- Stepper UI ---------- */

function renderStepper(activeSteps, currentId) {
  const visible = activeSteps.filter(s => !s.hidden);
  const parts = [];
  let idxNum = 1;
  visible.forEach((s, i) => {
    let cls = 'step';
    if (s.id === currentId) cls += ' active';
    else {
      // Mark "done" if it appears before the current step.
      const currentIndex = visible.findIndex(v => v.id === currentId);
      if (currentIndex > -1 && i < currentIndex) cls += ' done';
    }
    parts.push(`
      <span class="${cls}">
        <span class="step-num">${idxNum++}</span>
        ${escapeHTML(s.label)}
      </span>
    `);
    if (i < visible.length - 1) parts.push(`<span class="step-sep" aria-hidden="true"></span>`);
  });
  stepperEl.innerHTML = parts.join('');
}

/* ---------- Routing ---------- */

function parseHash() {
  const raw = window.location.hash.slice(1) || '';
  const [stepId, query] = raw.split('?');
  const params = new URLSearchParams(query || '');
  return { stepId, params };
}

function navigate(stepId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.return) params.set('return', opts.return);
  const qs = params.toString();
  window.location.hash = qs ? `${stepId}?${qs}` : stepId;
  // Scroll to top so the new step is visible.
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStepId(currentId, activeSteps) {
  const i = activeSteps.findIndex(s => s.id === currentId);
  if (i < 0 || i >= activeSteps.length - 1) return null;
  return activeSteps[i + 1].id;
}
function prevStepId(currentId, activeSteps) {
  const i = activeSteps.findIndex(s => s.id === currentId);
  if (i <= 0) return null;
  return activeSteps[i - 1].id;
}

/* ---------- Render dispatcher ---------- */

function render() {
  const draft = loadDraft();
  const activeSteps = getActiveSteps(draft);

  // If there's no contact data, the patient hasn't started — bounce them home.
  if (!draft.contact || !draft.contact.email) {
    cardEl.innerHTML = `
      <div class="step-eyebrow">Patient Intake</div>
      <h1 class="step-title">Let's start with a quick contact form.</h1>
      <p class="step-intro">Please complete the contact form on the homepage first so we know who you are and what you're interested in.</p>
    `;
    actionsEl.innerHTML = `<a href="index.html#contact" class="btn btn-primary">Go to contact form</a>`;
    stepperEl.innerHTML = '';
    return;
  }

  let { stepId, params } = parseHash();
  if (!stepId || !activeSteps.find(s => s.id === stepId)) {
    stepId = activeSteps[0].id;
    // Replace the URL so refresh keeps the right step.
    history.replaceState(null, '', `#${stepId}`);
  }
  const step = activeSteps.find(s => s.id === stepId);
  const returnTo = params.get('return') || null;

  renderStepper(activeSteps, stepId);
  step.render({ draft, activeSteps, returnTo });
}

window.addEventListener('hashchange', render);

/* ==========================================================================
   STEP DEFINITIONS
   Each step registers via registerStep({ id, label, when, render }).
   `render` is responsible for populating cardEl and actionsEl.
   ========================================================================== */

/* ---------- Step: Hair (placeholder) ---------- */

registerStep({
  id: 'hair',
  label: 'Hair',
  when: (interests) => interests.includes('hair'),
  render: ({ draft, activeSteps, returnTo }) => {
    cardEl.innerHTML = `
      <div class="step-eyebrow">Hair Loss Prevention &amp; Restoration</div>
      <h1 class="step-title">We'll have a hair intake form here soon.</h1>
      <p class="step-intro">
        For now, Dr. Ehrlich will follow up with you separately about your hair restoration interest.
        You can continue on to the rest of your intake.
      </p>
    `;
    renderStepActions({ activeSteps, currentId: 'hair', returnTo, onNext: () => goNext('hair', activeSteps, returnTo) });
  }
});

/* ---------- Step: Weight (placeholder) ---------- */

registerStep({
  id: 'weight',
  label: 'Weight',
  when: (interests) => interests.includes('weight'),
  render: ({ draft, activeSteps, returnTo }) => {
    cardEl.innerHTML = `
      <div class="step-eyebrow">Weight Management</div>
      <h1 class="step-title">We'll have a weight management intake form here soon.</h1>
      <p class="step-intro">
        For now, Dr. Ehrlich will follow up with you separately about GLP-1 therapy and weight management.
        You can continue on to the rest of your intake.
      </p>
    `;
    renderStepActions({ activeSteps, currentId: 'weight', returnTo, onNext: () => goNext('weight', activeSteps, returnTo) });
  }
});

/* ---------- Step: HRT (Testosterone Replacement) ---------- */

// Field group definitions — keys mirror the JSON shape so getByPath/setByPath work.
const HRT_GROUPS = {
  symptomsSexual: [
    { key: 'lowLibido',                label: 'Reduced sex drive (libido)' },
    { key: 'morningErectionDecrease',  label: 'Decreased morning or spontaneous erections' },
    { key: 'erectileDysfunction',      label: 'Erectile dysfunction' },
    { key: 'sexualSatisfactionDecrease', label: 'Decreased sexual satisfaction' }
  ],
  symptomsEnergy: [
    { key: 'fatigue',                  label: 'Fatigue or low energy' },
    { key: 'muscleMassDecrease',       label: 'Decreased muscle mass or strength' },
    { key: 'bodyFatIncrease',          label: 'Increased body fat or weight gain' },
    { key: 'exerciseToleranceLow',     label: 'Reduced exercise tolerance' },
    { key: 'hotFlashesOrSweating',     label: 'Hot flashes or sweating' }
  ],
  symptomsMood: [
    { key: 'depressedMood',            label: 'Depressed mood' },
    { key: 'irritability',             label: 'Irritability or mood swings' },
    { key: 'lowMotivation',            label: 'Low motivation or drive' },
    { key: 'concentrationOrMemory',    label: 'Difficulty concentrating or memory issues' }
  ],
  symptomsOther: [
    { key: 'boneDensityDecrease',      label: 'Decreased bone density or history of fractures' },
    { key: 'bodyHairDecrease',         label: 'Reduced facial or body hair' },
    { key: 'anemia',                   label: 'Anemia or low blood counts' },
    { key: 'sleepDisturbances',        label: 'Sleep disturbances' }
  ],
  cardio: [
    { key: 'highBloodPressure',        label: 'High blood pressure' },
    { key: 'highCholesterol',          label: 'High cholesterol' },
    { key: 'diabetesOrPrediabetes',    label: 'Diabetes or pre-diabetes' },
    { key: 'heartAttackOrCAD',         label: 'Heart attack or coronary artery disease' },
    { key: 'strokeOrTIA',              label: 'Stroke or TIA' },
    { key: 'congestiveHeartFailure',   label: 'Congestive heart failure' }
  ],
  clotting: [
    { key: 'historyOfClots',           label: 'History of blood clots (DVT/PE)' },
    { key: 'clottingDisorder',         label: 'Known clotting disorder' },
    { key: 'elevatedHematocrit',       label: 'Elevated hematocrit or polycythemia' }
  ],
  sleep: [
    { key: 'sleepApneaTreated',        label: 'Obstructive sleep apnea (treated)' },
    { key: 'sleepApneaUntreated',      label: 'Obstructive sleep apnea (untreated)' }
  ],
  urologic: [
    { key: 'bph',                      label: 'Benign prostatic hyperplasia (BPH)' },
    { key: 'elevatedPSA',              label: 'Elevated PSA' },
    { key: 'prostateCancer',           label: 'Prostate cancer (current or prior)' }
  ],
  endocrine: [
    { key: 'thyroidDisorder',          label: 'Thyroid disorder' },
    { key: 'pituitaryDisorder',        label: 'Pituitary disorder' },
    { key: 'liverDisease',             label: 'Liver disease' },
    { key: 'kidneyDisease',            label: 'Kidney disease' }
  ],
  cancer: [
    { key: 'breastCancer',             label: 'Breast cancer' },
    { key: 'prostateCancer',           label: 'Prostate cancer' }
  ],
  contraindications: [
    { key: 'prostateCancer',           label: 'Known/suspected prostate cancer' },
    { key: 'breastCancer',             label: 'Known/suspected breast cancer' },
    { key: 'hematocritHigh',           label: 'Hematocrit ≥ 54%' },
    { key: 'untreatedSleepApnea',      label: 'Untreated severe sleep apnea' },
    { key: 'uncontrolledHeartFailure', label: 'Uncontrolled heart failure' },
    { key: 'desiresFertility',         label: 'Active desire for fertility' }
  ]
};

function renderCheckGroup(pathPrefix, options, klass = '') {
  return `
    <div class="check-group ${klass}">
      ${options.map(o => `
        <label class="check-line">
          <input type="checkbox" name="${pathPrefix}.${o.key}">
          <span>${escapeHTML(o.label)}</span>
        </label>
      `).join('')}
    </div>
  `;
}

function renderRadioGroup(name, options) {
  return `
    <div class="inline-radios">
      ${options.map(o => `
        <label class="radio-line">
          <input type="radio" name="${name}" value="${escapeHTML(o.value)}">
          <span>${escapeHTML(o.label)}</span>
        </label>
      `).join('')}
    </div>
  `;
}

registerStep({
  id: 'hrt',
  label: 'Testosterone',
  when: (interests) => interests.includes('hrt'),
  render: ({ draft, activeSteps, returnTo }) => {
    // Pre-fill from contact data if HRT section hasn't been started.
    const c = draft.contact || {};
    const existingHrt = draft.hrt || {};
    const existingPatient = existingHrt.patient || {};
    const patientPrefill = {
      fullName: existingPatient.fullName || c.name || '',
      email:    existingPatient.email    || c.email || '',
      phone:    existingPatient.phone    || c.phone || ''
    };

    cardEl.innerHTML = `
      <div class="step-eyebrow">Testosterone Replacement</div>
      <h1 class="step-title">Patient Intake, Symptom Screening &amp; Contraindication Questionnaire</h1>
      <p class="step-intro">
        This questionnaire collects required medical history prior to treatment consideration,
        identifies contraindications to testosterone therapy, and evaluates symptoms of hypogonadism.
        Your responses are confidential and reviewed only by Dr. Ehrlich.
      </p>

      <form id="hrtForm" autocomplete="off" novalidate>

        <!-- ===== Section 1: Patient Identification ===== -->
        <div class="intake-section">
          <h3>Section 1 — Patient Identification</h3>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="hrt_fullName">Full name</label>
              <input type="text" id="hrt_fullName" name="hrt.patient.fullName" value="${escapeHTML(patientPrefill.fullName)}" required>
            </div>
            <div class="field">
              <label class="field-label" for="hrt_dob">Date of birth</label>
              <input type="date" id="hrt_dob" name="hrt.patient.dob">
            </div>
          </div>
          <div class="field-row cols-3">
            <div class="field">
              <label class="field-label" for="hrt_age">Age</label>
              <input type="number" id="hrt_age" name="hrt.patient.age" min="0" max="120">
            </div>
            <div class="field">
              <label class="field-label">Sex assigned at birth</label>
              ${renderRadioGroup('hrt.patient.sex', [
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' }
              ])}
            </div>
            <div class="field">
              <label class="field-label" for="hrt_phone">Phone number</label>
              <input type="tel" id="hrt_phone" name="hrt.patient.phone" value="${escapeHTML(patientPrefill.phone)}">
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="hrt_email">Email</label>
              <input type="email" id="hrt_email" name="hrt.patient.email" value="${escapeHTML(patientPrefill.email)}" required>
            </div>
            <div class="field-row">
              <div class="field">
                <label class="field-label" for="hrt_height">Height</label>
                <input type="text" id="hrt_height" name="hrt.patient.height" placeholder="e.g. 5'10&quot;">
              </div>
              <div class="field">
                <label class="field-label" for="hrt_weight">Weight</label>
                <input type="text" id="hrt_weight" name="hrt.patient.weight" placeholder="e.g. 180 lbs">
              </div>
            </div>
          </div>
        </div>

        <!-- ===== Section 2: Primary Care Provider ===== -->
        <div class="intake-section">
          <h3>Section 2 — Primary Care Provider</h3>
          <div class="field">
            ${renderRadioGroup('hrt.pcp.has', [
              { value: 'yes', label: 'I have a primary care provider' },
              { value: 'no',  label: 'I do not currently have a primary care provider' }
            ])}
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="hrt_pcp_name">Provider name</label>
              <input type="text" id="hrt_pcp_name" name="hrt.pcp.name">
            </div>
            <div class="field">
              <label class="field-label" for="hrt_pcp_clinic">Practice / clinic name</label>
              <input type="text" id="hrt_pcp_clinic" name="hrt.pcp.clinic">
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="hrt_pcp_phone">Provider phone number</label>
            <input type="tel" id="hrt_pcp_phone" name="hrt.pcp.phone">
          </div>
        </div>

        <!-- ===== Section 3: Symptom Screening ===== -->
        <div class="intake-section">
          <h3>Section 3 — Symptom Screening</h3>
          <p class="section-note">Please indicate whether you have experienced the following symptoms for 3 months or longer.</p>

          <h4>Sexual symptoms</h4>
          ${renderCheckGroup('hrt.symptoms.sexual', HRT_GROUPS.symptomsSexual)}

          <h4>Energy &amp; physical symptoms</h4>
          ${renderCheckGroup('hrt.symptoms.energy', HRT_GROUPS.symptomsEnergy)}

          <h4>Mood &amp; cognitive symptoms</h4>
          ${renderCheckGroup('hrt.symptoms.mood', HRT_GROUPS.symptomsMood)}

          <h4>Other symptoms</h4>
          ${renderCheckGroup('hrt.symptoms.other', HRT_GROUPS.symptomsOther)}

          <div class="field" style="margin-top:1rem">
            <label class="field-label">Overall symptom severity</label>
            ${renderRadioGroup('hrt.symptoms.severity', [
              { value: 'mild',     label: 'Mild' },
              { value: 'moderate', label: 'Moderate' },
              { value: 'severe',   label: 'Severe' }
            ])}
          </div>
        </div>

        <!-- ===== Section 4: Medical History ===== -->
        <div class="intake-section">
          <h3>Section 4 — Medical History</h3>
          <p class="section-note">Check all that apply.</p>

          <h4>Cardiovascular &amp; metabolic</h4>
          ${renderCheckGroup('hrt.medicalHistory.cardio', HRT_GROUPS.cardio)}

          <h4>Hematologic / clotting</h4>
          ${renderCheckGroup('hrt.medicalHistory.clotting', HRT_GROUPS.clotting)}

          <h4>Respiratory / sleep</h4>
          ${renderCheckGroup('hrt.medicalHistory.sleep', HRT_GROUPS.sleep)}

          <h4>Urologic / prostate (if applicable)</h4>
          ${renderCheckGroup('hrt.medicalHistory.urologic', HRT_GROUPS.urologic)}

          <h4>Endocrine / other</h4>
          ${renderCheckGroup('hrt.medicalHistory.endocrine', HRT_GROUPS.endocrine)}

          <h4>Cancer history</h4>
          ${renderCheckGroup('hrt.medicalHistory.cancer', HRT_GROUPS.cancer)}
          <div class="field" style="margin-top:0.6rem">
            <label class="field-label" for="hrt_cancerOther">Other cancer (if any)</label>
            <input type="text" id="hrt_cancerOther" name="hrt.medicalHistory.cancerOther">
          </div>
        </div>

        <!-- ===== Section 5: Surgical History ===== -->
        <div class="intake-section">
          <h3>Section 5 — Surgical History</h3>
          <div class="field">
            <label class="field-label" for="hrt_surgicalHistory">Please list any prior surgeries</label>
            <textarea id="hrt_surgicalHistory" name="hrt.surgicalHistory" placeholder="Including testicular, prostate, pituitary, or bariatric surgery"></textarea>
          </div>
        </div>

        <!-- ===== Section 6: Medications & Supplements ===== -->
        <div class="intake-section">
          <h3>Section 6 — Medications &amp; Supplements</h3>
          <div class="field">
            <label class="field-label" for="hrt_medications">Please list all current medications, supplements, or hormones</label>
            <textarea id="hrt_medications" name="hrt.medications"></textarea>
          </div>
          <label class="check-line">
            <input type="checkbox" name="hrt.usingTestosterone">
            <span>I am currently using testosterone or anabolic steroids</span>
          </label>
        </div>

        <!-- ===== Section 7: Fertility & Family Planning ===== -->
        <div class="intake-section">
          <h3>Section 7 — Fertility &amp; Family Planning</h3>
          <div class="field">
            ${renderRadioGroup('hrt.fertility.intent', [
              { value: 'preserve',  label: 'I wish to preserve fertility or have children in the future' },
              { value: 'noDesire',  label: 'I do not desire future fertility' },
              { value: 'unsure',    label: 'I am unsure' }
            ])}
          </div>
          <div class="field">
            <label class="field-label">Have you had a vasectomy?</label>
            ${renderRadioGroup('hrt.fertility.vasectomy', [
              { value: 'yes', label: 'Yes' },
              { value: 'no',  label: 'No' }
            ])}
          </div>
        </div>

        <!-- ===== Section 8: Lifestyle & Social History ===== -->
        <div class="intake-section">
          <h3>Section 8 — Lifestyle &amp; Social History</h3>
          <div class="field">
            <label class="field-label">Do you smoke or vape?</label>
            ${renderRadioGroup('hrt.lifestyle.smoking', [
              { value: 'yes', label: 'Yes' },
              { value: 'no',  label: 'No' }
            ])}
          </div>
          <div class="field">
            <label class="field-label">Alcohol use</label>
            ${renderRadioGroup('hrt.lifestyle.alcohol', [
              { value: 'none',       label: 'None' },
              { value: 'occasional', label: 'Occasional' },
              { value: 'moderate',   label: 'Moderate' },
              { value: 'heavy',      label: 'Heavy' }
            ])}
          </div>
          <div class="field">
            <label class="field-label">Recreational drug use</label>
            ${renderRadioGroup('hrt.lifestyle.recreationalDrugs', [
              { value: 'yes', label: 'Yes' },
              { value: 'no',  label: 'No' }
            ])}
          </div>
          <div class="field">
            <label class="field-label">Exercise frequency per week</label>
            ${renderRadioGroup('hrt.lifestyle.exercise', [
              { value: '0-1', label: '0–1' },
              { value: '2-3', label: '2–3' },
              { value: '4+',  label: '4+' }
            ])}
          </div>
        </div>

        <!-- ===== Section 9: Contraindication Screening ===== -->
        <div class="intake-section">
          <h3>Section 9 — Contraindication Screening</h3>
          <p class="section-note">Please answer Yes or No to each.</p>
          ${HRT_GROUPS.contraindications.map(o => `
            <div class="field">
              <label class="field-label">${escapeHTML(o.label)}</label>
              ${renderRadioGroup(`hrt.contraindications.${o.key}`, [
                { value: 'yes', label: 'Yes' },
                { value: 'no',  label: 'No' }
              ])}
            </div>
          `).join('')}
        </div>

        <!-- ===== Section 10: Patient Attestation ===== -->
        <div class="intake-section">
          <h3>Section 10 — Patient Attestation</h3>
          <label class="check-line" style="display:flex;margin-bottom:1rem">
            <input type="checkbox" name="hrt.attestation.confirmed">
            <span>I confirm that the information provided is accurate and complete to the best of my knowledge. I understand that omission of medical history may affect treatment safety.</span>
          </label>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="hrt_signature">Signature (type your full name)</label>
              <input type="text" id="hrt_signature" name="hrt.attestation.signature">
            </div>
            <div class="field">
              <label class="field-label" for="hrt_attestDate">Date</label>
              <input type="date" id="hrt_attestDate" name="hrt.attestation.date">
            </div>
          </div>
        </div>

      </form>
    `;

    const formEl = document.getElementById('hrtForm');
    fillForm(formEl, draft);

    renderStepActions({
      activeSteps,
      currentId: 'hrt',
      returnTo,
      onNext: () => {
        const draftNow = loadDraft();
        const collected = collectForm(formEl);
        // collectForm produces { hrt: {...} } — merge that into the existing draft.
        draftNow.hrt = (collected.hrt || {});
        saveDraft(draftNow);
        goNext('hrt', activeSteps, returnTo);
      }
    });

    // Save on every change so a refresh / accidental nav doesn't lose data.
    formEl.addEventListener('input', () => {
      const draftNow = loadDraft();
      const collected = collectForm(formEl);
      draftNow.hrt = (collected.hrt || {});
      saveDraft(draftNow);
    });
  }
});

/* ---------- Step: Review ---------- */

// Map of label registries used to translate boolean keys into human-readable text.
const HRT_LABEL_GROUPS = {
  'symptoms.sexual':           HRT_GROUPS.symptomsSexual,
  'symptoms.energy':           HRT_GROUPS.symptomsEnergy,
  'symptoms.mood':             HRT_GROUPS.symptomsMood,
  'symptoms.other':            HRT_GROUPS.symptomsOther,
  'medicalHistory.cardio':     HRT_GROUPS.cardio,
  'medicalHistory.clotting':   HRT_GROUPS.clotting,
  'medicalHistory.sleep':      HRT_GROUPS.sleep,
  'medicalHistory.urologic':   HRT_GROUPS.urologic,
  'medicalHistory.endocrine':  HRT_GROUPS.endocrine,
  'medicalHistory.cancer':     HRT_GROUPS.cancer
};

const HRT_VALUE_LABELS = {
  'patient.sex':               { male: 'Male', female: 'Female' },
  'pcp.has':                   { yes: 'Has a primary care provider', no: 'No primary care provider' },
  'symptoms.severity':         { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' },
  'fertility.intent': {
    preserve: 'Wishes to preserve fertility', noDesire: 'Does not desire future fertility', unsure: 'Unsure'
  },
  'fertility.vasectomy':       { yes: 'Yes', no: 'No' },
  'lifestyle.smoking':         { yes: 'Yes', no: 'No' },
  'lifestyle.alcohol':         { none: 'None', occasional: 'Occasional', moderate: 'Moderate', heavy: 'Heavy' },
  'lifestyle.recreationalDrugs': { yes: 'Yes', no: 'No' },
  'lifestyle.exercise':        { '0-1': '0–1 times/week', '2-3': '2–3 times/week', '4+': '4+ times/week' }
};

function selectedLabels(record, group) {
  if (!record) return [];
  return group.filter(o => !!record[o.key]).map(o => o.label);
}

function listOrDash(items) {
  if (!items || !items.length) return '<span class="review-empty">— none indicated —</span>';
  return `<ul>${items.map(i => `<li>${escapeHTML(i)}</li>`).join('')}</ul>`;
}
function textOrDash(value) {
  if (value == null || value === '') return '<span class="review-empty">— not provided —</span>';
  return escapeHTML(value);
}

function reviewSection(title, stepId, body) {
  return `
    <div class="review-section">
      <div class="review-head">
        <h3>${escapeHTML(title)}</h3>
        <button type="button" class="review-edit-link" data-edit="${stepId}">
          ✏️ Edit this section
        </button>
      </div>
      ${body}
    </div>
  `;
}

function renderContactReview(draft) {
  const c = draft.contact || {};
  const interestLabels = {
    hair:   'Hair Loss Prevention &amp; Restoration',
    weight: 'Weight Management',
    hrt:    'Testosterone Replacement'
  };
  const interests = (c.interests || []).map(i => interestLabels[i] || i);
  const body = `
    <dl class="review-pairs">
      <dt>Name</dt>             <dd>${textOrDash(c.name)}</dd>
      <dt>Email</dt>            <dd>${textOrDash(c.email)}</dd>
      <dt>Phone</dt>            <dd>${textOrDash(c.phone)}</dd>
      <dt>Interested in</dt>    <dd>${interests.length ? interests.join(', ') : '<span class="review-empty">— none selected —</span>'}</dd>
      <dt>Message</dt>          <dd>${textOrDash(c.message)}</dd>
    </dl>
  `;
  return reviewSection('Contact information', '__contact__', body);
}

function renderHrtReview(draft) {
  const h = draft.hrt || {};
  const p = h.patient || {};
  const pcp = h.pcp || {};
  const sym = h.symptoms || {};
  const med = h.medicalHistory || {};
  const fert = h.fertility || {};
  const life = h.lifestyle || {};
  const cont = h.contraindications || {};
  const att = h.attestation || {};

  const valueOf = (path, value) =>
    HRT_VALUE_LABELS[path] && HRT_VALUE_LABELS[path][value] ? HRT_VALUE_LABELS[path][value] : value;

  const body = `
    <h4 style="margin-top:0">Patient identification</h4>
    <dl class="review-pairs">
      <dt>Full name</dt>        <dd>${textOrDash(p.fullName)}</dd>
      <dt>Date of birth</dt>    <dd>${textOrDash(p.dob)}</dd>
      <dt>Age</dt>              <dd>${textOrDash(p.age)}</dd>
      <dt>Sex assigned at birth</dt> <dd>${p.sex ? escapeHTML(valueOf('patient.sex', p.sex)) : '<span class="review-empty">— not provided —</span>'}</dd>
      <dt>Phone</dt>            <dd>${textOrDash(p.phone)}</dd>
      <dt>Email</dt>            <dd>${textOrDash(p.email)}</dd>
      <dt>Height</dt>           <dd>${textOrDash(p.height)}</dd>
      <dt>Weight</dt>           <dd>${textOrDash(p.weight)}</dd>
    </dl>

    <h4>Primary care provider</h4>
    <dl class="review-pairs">
      <dt>Status</dt>           <dd>${pcp.has ? escapeHTML(valueOf('pcp.has', pcp.has)) : '<span class="review-empty">— not provided —</span>'}</dd>
      <dt>Provider name</dt>    <dd>${textOrDash(pcp.name)}</dd>
      <dt>Practice / clinic</dt><dd>${textOrDash(pcp.clinic)}</dd>
      <dt>Phone</dt>            <dd>${textOrDash(pcp.phone)}</dd>
    </dl>

    <h4>Symptom screening (3+ months)</h4>
    <dl class="review-pairs">
      <dt>Sexual</dt>           <dd>${listOrDash(selectedLabels(sym.sexual, HRT_LABEL_GROUPS['symptoms.sexual']))}</dd>
      <dt>Energy &amp; physical</dt> <dd>${listOrDash(selectedLabels(sym.energy, HRT_LABEL_GROUPS['symptoms.energy']))}</dd>
      <dt>Mood &amp; cognitive</dt>  <dd>${listOrDash(selectedLabels(sym.mood, HRT_LABEL_GROUPS['symptoms.mood']))}</dd>
      <dt>Other</dt>            <dd>${listOrDash(selectedLabels(sym.other, HRT_LABEL_GROUPS['symptoms.other']))}</dd>
      <dt>Overall severity</dt> <dd>${sym.severity ? escapeHTML(valueOf('symptoms.severity', sym.severity)) : '<span class="review-empty">— not selected —</span>'}</dd>
    </dl>

    <h4>Medical history</h4>
    <dl class="review-pairs">
      <dt>Cardiovascular &amp; metabolic</dt> <dd>${listOrDash(selectedLabels(med.cardio,    HRT_LABEL_GROUPS['medicalHistory.cardio']))}</dd>
      <dt>Hematologic / clotting</dt>         <dd>${listOrDash(selectedLabels(med.clotting,  HRT_LABEL_GROUPS['medicalHistory.clotting']))}</dd>
      <dt>Respiratory / sleep</dt>            <dd>${listOrDash(selectedLabels(med.sleep,     HRT_LABEL_GROUPS['medicalHistory.sleep']))}</dd>
      <dt>Urologic / prostate</dt>            <dd>${listOrDash(selectedLabels(med.urologic,  HRT_LABEL_GROUPS['medicalHistory.urologic']))}</dd>
      <dt>Endocrine / other</dt>              <dd>${listOrDash(selectedLabels(med.endocrine, HRT_LABEL_GROUPS['medicalHistory.endocrine']))}</dd>
      <dt>Cancer history</dt>                 <dd>${listOrDash(selectedLabels(med.cancer,    HRT_LABEL_GROUPS['medicalHistory.cancer']))}</dd>
      <dt>Other cancer</dt>                   <dd>${textOrDash(med.cancerOther)}</dd>
    </dl>

    <h4>Surgical history</h4>
    <dl class="review-pairs">
      <dt>Prior surgeries</dt>  <dd>${textOrDash(h.surgicalHistory)}</dd>
    </dl>

    <h4>Medications &amp; supplements</h4>
    <dl class="review-pairs">
      <dt>Current</dt>          <dd>${textOrDash(h.medications)}</dd>
      <dt>Currently using testosterone or anabolic steroids</dt>
                                <dd>${h.usingTestosterone ? 'Yes' : 'No'}</dd>
    </dl>

    <h4>Fertility &amp; family planning</h4>
    <dl class="review-pairs">
      <dt>Intent</dt>           <dd>${fert.intent ? escapeHTML(valueOf('fertility.intent', fert.intent)) : '<span class="review-empty">— not selected —</span>'}</dd>
      <dt>Vasectomy</dt>        <dd>${fert.vasectomy ? escapeHTML(valueOf('fertility.vasectomy', fert.vasectomy)) : '<span class="review-empty">— not selected —</span>'}</dd>
    </dl>

    <h4>Lifestyle &amp; social history</h4>
    <dl class="review-pairs">
      <dt>Smokes or vapes</dt>          <dd>${life.smoking ? escapeHTML(valueOf('lifestyle.smoking', life.smoking)) : '<span class="review-empty">— not selected —</span>'}</dd>
      <dt>Alcohol use</dt>              <dd>${life.alcohol ? escapeHTML(valueOf('lifestyle.alcohol', life.alcohol)) : '<span class="review-empty">— not selected —</span>'}</dd>
      <dt>Recreational drug use</dt>    <dd>${life.recreationalDrugs ? escapeHTML(valueOf('lifestyle.recreationalDrugs', life.recreationalDrugs)) : '<span class="review-empty">— not selected —</span>'}</dd>
      <dt>Exercise frequency</dt>       <dd>${life.exercise ? escapeHTML(valueOf('lifestyle.exercise', life.exercise)) : '<span class="review-empty">— not selected —</span>'}</dd>
    </dl>

    <h4>Contraindication screening</h4>
    <dl class="review-pairs">
      ${HRT_GROUPS.contraindications.map(o => `
        <dt>${o.label}</dt>
        <dd>${cont[o.key] ? escapeHTML((cont[o.key] === 'yes') ? 'Yes' : 'No') : '<span class="review-empty">— not selected —</span>'}</dd>
      `).join('')}
    </dl>

    <h4>Attestation</h4>
    <dl class="review-pairs">
      <dt>Confirmed accuracy</dt> <dd>${att.confirmed ? 'Yes' : '<span class="review-empty">— not yet confirmed —</span>'}</dd>
      <dt>Signature</dt>          <dd>${textOrDash(att.signature)}</dd>
      <dt>Date</dt>               <dd>${textOrDash(att.date)}</dd>
    </dl>
  `;
  return reviewSection('Testosterone Replacement intake', 'hrt', body);
}

function renderHairReview(draft) {
  const body = `<p class="review-empty">No hair-specific intake form yet — Dr. Ehrlich will follow up with you separately.</p>`;
  return reviewSection('Hair Loss Prevention &amp; Restoration', 'hair', body);
}
function renderWeightReview(draft) {
  const body = `<p class="review-empty">No weight-management intake form yet — Dr. Ehrlich will follow up with you separately.</p>`;
  return reviewSection('Weight Management', 'weight', body);
}

registerStep({
  id: 'review',
  label: 'Review',
  render: ({ draft, activeSteps }) => {
    const interests = (draft.contact && draft.contact.interests) || [];
    let sections = renderContactReview(draft);
    if (interests.includes('hair'))   sections += renderHairReview(draft);
    if (interests.includes('weight')) sections += renderWeightReview(draft);
    if (interests.includes('hrt'))    sections += renderHrtReview(draft);

    cardEl.innerHTML = `
      <div class="step-eyebrow">Review</div>
      <h1 class="step-title">Review your information</h1>
      <p class="step-intro">
        Please review everything below. Click <strong>Edit this section</strong> on any item to make changes.
        When you're satisfied, submit it for Dr. Ehrlich to review.
      </p>
      ${sections}
    `;

    actionsEl.innerHTML = `
      <button type="button" class="btn btn-ghost" id="navBack">Back</button>
      <div class="actions-end">
        <button type="button" class="btn btn-primary" id="navSubmit">Submit for Dr. Ehrlich to review</button>
      </div>
    `;
    document.getElementById('navBack').onclick = () => {
      const prev = prevStepId('review', activeSteps);
      if (prev) navigate(prev);
    };
    document.getElementById('navSubmit').onclick = () => navigate('submitted');

    // Wire up Edit buttons. The "__contact__" pseudo-target sends the user to
    // the homepage contact form because that's where contact info is entered.
    cardEl.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => {
        const target = btn.getAttribute('data-edit');
        if (target === '__contact__') {
          window.location.href = 'index.html#contact';
        } else {
          navigate(target, { return: 'review' });
        }
      };
    });
  }
});

/* Submitted: post-submit confirmation. Hidden from the stepper. */
registerStep({
  id: 'submitted',
  label: 'Submitted',
  hidden: true,
  when: () => true,
  render: ({ draft }) => {
    cardEl.innerHTML = `
      <div class="step-eyebrow">Thank you</div>
      <h1 class="step-title">Your information has been recorded.</h1>
      <p class="step-intro">
        Dr. Ehrlich will personally review your intake and follow up with you at the
        contact information you provided.
      </p>
      <div class="stub-notice">
        <strong>Heads-up — backend not yet connected.</strong>
        Right now, your responses are stored only in this browser. Before this can be used with
        real patients, the Submit step needs to be wired to a secure backend (Firebase / Firestore
        is the planned destination) and the practice needs a HIPAA Business Associate Agreement
        in place. Until then, treat this as a preview.
      </div>
    `;
    actionsEl.innerHTML = `
      <button type="button" class="btn btn-ghost" id="navStartOver">Start over</button>
      <div class="actions-end">
        <a href="index.html" class="btn btn-primary">Back to site</a>
      </div>
    `;
    document.getElementById('navStartOver').onclick = () => {
      if (!confirm('Clear this intake and start fresh?')) return;
      try { localStorage.removeItem(INTAKE_DRAFT_KEY); } catch (_) {}
      window.location.href = 'index.html#contact';
    };
  }
});

// Reorder STEPS so Review/Submitted come last (in case someone registers
// out of order in the future).
function reorderSteps() {
  const fixed = ['review', 'submitted'];
  STEPS.sort((a, b) => {
    const ai = fixed.indexOf(a.id);
    const bi = fixed.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return -1;
    if (bi === -1) return 1;
    return ai - bi;
  });
}
reorderSteps();

/* ---------- Shared step actions (Back / Next, with Edit-return support) ---------- */

function renderStepActions({ activeSteps, currentId, returnTo, onNext, onBack, nextLabel }) {
  const prev = prevStepId(currentId, activeSteps);
  const isReturning = returnTo === 'review';
  const computedNextLabel = nextLabel || (isReturning ? 'Save &amp; back to review' : 'Next');
  actionsEl.innerHTML = `
    ${prev && !isReturning
      ? `<button type="button" class="btn btn-ghost" id="navBack">Back</button>`
      : (isReturning
          ? `<button type="button" class="btn btn-ghost" id="navBack">Cancel</button>`
          : `<span></span>`)}
    <div class="actions-end">
      <button type="button" class="btn btn-primary" id="navNext">${computedNextLabel}</button>
    </div>
  `;
  const backBtn = document.getElementById('navBack');
  if (backBtn) {
    backBtn.onclick = () => {
      if (typeof onBack === 'function') return onBack();
      if (isReturning) {
        navigate('review');
      } else if (prev) {
        navigate(prev);
      }
    };
  }
  document.getElementById('navNext').onclick = () => {
    if (typeof onNext === 'function') onNext();
  };
}

function goNext(currentId, activeSteps, returnTo) {
  if (returnTo === 'review') {
    navigate('review');
  } else {
    const next = nextStepId(currentId, activeSteps);
    if (next) navigate(next);
  }
}

/* ---------- Boot ---------- */

document.addEventListener('DOMContentLoaded', render);
