import { label } from './presentation.js';
export const Badge = ({ value, text }: { value: string; text?: string }) => {
  const tone = ['completed', 'succeeded', 'approved', 'won'].includes(value)
    ? 'success'
    : ['failed', 'error', 'lost', 'retired'].includes(value)
      ? 'danger'
      : ['started', 'processing', 'new', 'in-progress'].includes(value)
        ? 'pending'
        : 'neutral';
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <i />
      {text ?? label(value)}
    </span>
  );
};
