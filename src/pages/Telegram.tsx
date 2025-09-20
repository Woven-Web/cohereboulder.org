import { useEffect } from 'react';

export default function Telegram() {
  useEffect(() => {
    window.location.href = 'https://t.me/+AgeYJ-2Guo1iOTU5';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-earth">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-earth mb-4">
          Redirecting to COhere Boulder Telegram...
        </h2>
        <p className="text-earth-light">
          If you are not redirected automatically,
          <a
            href="https://t.me/+AgeYJ-2Guo1iOTU5"
            className="text-sage font-semibold hover:underline ml-1"
          >
            click here
          </a>
        </p>
      </div>
    </div>
  );
}
