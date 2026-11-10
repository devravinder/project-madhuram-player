export const getId = (size: number = 8) => {
  if (crypto?.randomUUID) return crypto.randomUUID().slice(0, size);

  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(
    0,
    size,
  );
};
