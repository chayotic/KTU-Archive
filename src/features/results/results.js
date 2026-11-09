import { mountSelect } from '../../components/select.js';
import { showToast } from '../../components/toast.js';
import { requestResults } from '../../services/results.js';
import { navigateTo } from '../navigation/views.js';
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from './credentials.js';
import { storeResult } from './result-view.js';

const SEMESTERS = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Semester ${index + 1}`,
}));

export function mountResults() {
  const root = document.querySelector('[data-results]');
  if (!root) return;

  const semesterRoot = root.querySelector('[data-results-semester]');
  if (!semesterRoot) return;

  const register = root.querySelector('[data-results-register]');
  const password = root.querySelector('[data-results-password]');
  const fetchButton = root.querySelector('[data-results-fetch]');
  const fetchLabel = root.querySelector('[data-results-fetch-label]');
  const fetchLoader = root.querySelector('[data-results-loader]');
  const saveInput = root.querySelector('[data-results-save]');
  const logs = root.querySelector('[data-results-logs]');
  const logList = root.querySelector('[data-results-log-list]');

  let fetching = false;

  const semesterSelect = mountSelect(semesterRoot, { onChange: update });

  function update() {
    if (!fetchButton) return;
    const ready = Boolean(
      register?.value.trim() && password?.value && semesterSelect.getValue(),
    );

    fetchButton.disabled = fetching;
    fetchButton.setAttribute('aria-disabled', String(!fetching && !ready));
  }

  function setLoading(loading) {
    fetching = loading;

    if (fetchButton) {
      fetchButton.classList.toggle('is-loading', loading);
      if (loading) fetchButton.setAttribute('aria-busy', 'true');
      else fetchButton.removeAttribute('aria-busy');
    }
    if (fetchLoader) fetchLoader.hidden = !loading;
    if (fetchLabel) fetchLabel.textContent = loading ? 'Fetching Results' : 'Fetch Results';

    update();
  }

  function resetLogs() {
    if (!logs || !logList) return;
    logList.replaceChildren();
    logs.hidden = false;
  }

  function appendLog(message, { error = false } = {}) {
    if (!logs || !logList) return;
    const text = String(message ?? '').trim();
    if (!text) return;

    logs.hidden = false;

    const item = document.createElement('li');
    item.className = 'md3-results__log';
    if (error) item.classList.add('is-error');
    item.textContent = text;
    logList.append(item);
    logList.scrollTop = logList.scrollHeight;
  }

  async function persistCredentials() {
    try {
      if (!saveInput?.checked) {
        clearCredentials();
        return;
      }

      if (!register?.value.trim() || !password?.value) return;

      await saveCredentials({
        username: register.value.trim(),
        password: password.value,
      });
    } catch {
      if (saveInput) saveInput.checked = false;
      showToast('Could not save credentials in this browser.');
    }
  }

  async function handleFetch() {
    if (fetching) return;

    const username = register?.value.trim() ?? '';
    const passwordValue = password?.value ?? '';
    const semester = semesterSelect.getValue();

    if (!username) {
      showToast('Fill in your registration number.', { variant: 'warning' });
      return;
    }

    if (!passwordValue) {
      showToast('Fill in your password.', { variant: 'warning' });
      return;
    }

    if (!semester) {
      showToast('Select a semester.', { variant: 'warning' });
      return;
    }

    await persistCredentials();
    setLoading(true);
    resetLogs();
    appendLog('Connecting to the KTU portal');
    appendLog('This can take a few minutes if the portal is slow');

    try {
      const payload = await requestResults({
        username,
        password: passwordValue,
        semesterId: semester,
        onLog: appendLog,
      });
      const data = payload.data;

      if (
        !data ||
        !Array.isArray(data.headers) ||
        !Array.isArray(data.rows) ||
        data.rows.length === 0
      ) {
        throw new Error('No results found for this semester.');
      }

      appendLog('Grade card received. Opening results');
      storeResult({ data, semester });
      navigateTo('result-view');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to fetch results.';
      showToast(message);
      appendLog(message, { error: true });
    } finally {
      setLoading(false);
    }
  }

  semesterSelect.setOptions(SEMESTERS);

  register?.addEventListener('input', () => {
    register.value = register.value.toUpperCase();
    update();
  });
  password?.addEventListener('input', update);
  register?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || fetchButton?.disabled) return;
    event.preventDefault();
    handleFetch();
  });
  password?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || fetchButton?.disabled) return;
    event.preventDefault();
    handleFetch();
  });

  saveInput?.addEventListener('change', async () => {
    if (!saveInput.checked) {
      try {
        clearCredentials();
      } catch {
        return;
      }
      return;
    }

    if (register?.value.trim() && password?.value) {
      try {
        await saveCredentials({
          username: register.value.trim(),
          password: password.value,
        });
      } catch {
        saveInput.checked = false;
        showToast('Could not save credentials in this browser.');
      }
    }
  });

  fetchButton?.addEventListener('click', handleFetch);

  loadCredentials()
    .then((stored) => {
      if (!stored) return;
      if (register) register.value = (stored.username ?? '').toUpperCase();
      if (password) password.value = stored.password ?? '';
      if (saveInput) saveInput.checked = Boolean(stored.username && stored.password);
      update();
    })
    .catch(() => {});

  update();

  return { semesterSelect };
}
