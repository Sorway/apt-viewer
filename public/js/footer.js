const updateMenu = document.querySelector('.footer-update');
const copyUpdate = updateMenu.querySelector('[data-copy-update]');
const updateCommand = updateMenu.querySelector('#update-command');
const copyStatus = updateMenu.querySelector('.update-copy-status');

function copyWithSelection(text) {
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.className = 'clipboard-input';
  copyUpdate.parentElement.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    return document.execCommand('copy');
  } finally {
    input.remove();
    copyUpdate.focus({ preventScroll: true });
  }
}

copyUpdate.hidden = false;
copyUpdate.addEventListener('click', async () => {
  const command = updateCommand.textContent.trim();
  copyStatus.textContent = '';
  let copied = false;
  try {
    await navigator.clipboard.writeText(command);
    copied = true;
  } catch {
    try {
      copied = copyWithSelection(command);
    } catch {}
  }
  copyStatus.textContent = copied ? window.aptI18n.t('update.copied') : window.aptI18n.t('update.copyFailed');
});

updateMenu.addEventListener('toggle', () => {
  if (!updateMenu.open) copyStatus.textContent = '';
});
document.addEventListener('pointerdown', event => {
  if (!updateMenu.contains(event.target)) updateMenu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && updateMenu.open) {
    updateMenu.open = false;
    updateMenu.querySelector('summary').focus({ preventScroll: true });
  }
});
updateMenu.addEventListener('focusout', event => {
  if (event.relatedTarget && !updateMenu.contains(event.relatedTarget)) updateMenu.open = false;
});
