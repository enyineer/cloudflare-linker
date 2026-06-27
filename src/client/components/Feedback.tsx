export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function LoadingScreen() {
  return (
    <div className="center-screen">
      <Spinner />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner banner--error" role="alert">
      {message}
    </div>
  );
}
