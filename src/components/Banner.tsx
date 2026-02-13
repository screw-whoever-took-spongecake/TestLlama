import type { ReactElement } from 'react';

function Banner(): ReactElement {
  return (
    <header className="banner">
      <h1 className="banner-title">TestLlama</h1>
      <p className="banner-subtitle">Dashboard</p>
    </header>
  );
}

export default Banner;
