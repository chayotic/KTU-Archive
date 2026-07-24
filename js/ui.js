export function populateOptions(selectElement, items, valueKey, labelKey, placeholder) {
    const container = selectElement.querySelector('.select-options');
    if (!container) return;

    container.innerHTML = '';

    const ph = document.createElement('div');
    ph.className = 'placeholder';
    ph.dataset.value = '';
    ph.textContent = placeholder || 'Select...';
    container.appendChild(ph);

    items.forEach(item => {
        const div = document.createElement('div');
        div.dataset.value = item[valueKey];
        div.textContent = item[labelKey];
        container.appendChild(div);
    });

    const trigger = selectElement.querySelector('.selected-text');
    if (trigger) trigger.textContent = placeholder || 'Select...';
    selectElement.removeAttribute('data-selected-value');
}

export function attachOptionClickHandlers(selectElement, onChange) {
    const container = selectElement.querySelector('.select-options');
    if (!container) return;

    container.addEventListener('mousedown', (e) => {
        const option = e.target.closest('div');
        if (!option) return;

        const value = option.dataset.value;
        const text = option.textContent;

        container.querySelectorAll('div').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        const trigger = selectElement.querySelector('.selected-text');
        if (trigger) trigger.textContent = text;

        selectElement.dataset.selectedValue = value;
        selectElement.classList.remove('open');

        if (onChange) onChange(selectElement.id, value);
    });
}

export function initCustomSelect(selectElement) {
    const trigger = selectElement.querySelector('.select-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== selectElement) el.classList.remove('open');
        });
        selectElement.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!selectElement.contains(e.target)) {
            selectElement.classList.remove('open');
        }
    });
}
