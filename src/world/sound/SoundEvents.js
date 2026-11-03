const emit = (type) => {
  if (typeof document === 'undefined' || typeof document.dispatchEvent !== 'function') return;
  document.dispatchEvent(new Event(type));
};

export const startTypingFx = () => emit('paw-haven-typing-start');
export const stopTypingFx = () => emit('paw-haven-typing-stop');
