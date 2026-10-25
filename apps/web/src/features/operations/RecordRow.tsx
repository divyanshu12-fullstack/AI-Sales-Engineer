import type { ReactNode } from 'react';
export const RecordRow = ({ children, onOpen }: { children: ReactNode; onOpen: () => void }) => (
  <tr className="record-row" onClick={onOpen}>
    {children}
  </tr>
);
export const RecordButton = ({
  children,
  onOpen,
  label,
}: {
  children: ReactNode;
  onOpen: () => void;
  label?: string;
}) => (
  <button
    type="button"
    className="record-name"
    aria-label={label}
    onClick={(event) => {
      event.stopPropagation();
      onOpen();
    }}
  >
    {children}
  </button>
);
