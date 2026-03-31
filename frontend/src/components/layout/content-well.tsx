interface ContentWellProps {
  children: React.ReactNode;
  className?: string;
}

export function ContentWell({ children, className = '' }: ContentWellProps) {
  return (
    <div className={`content-well space-y-12 ${className}`}>
      {children}
    </div>
  );
}
