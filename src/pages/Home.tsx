import type { ReactElement } from 'react';

const LLAMA_ASCII = `⠀⠀⣀⣀⠀⠀⠀⠀⠀⣀⣀⠀⠀
⠀⢰⡏⢹⡆⠀⠀⠀⢰⡏⢹⡆⠀
⠀⢸⡇⣸⡷⠟⠛⠻⢾⣇⣸⡇⠀
⢠⡾⠛⠉⠁⠀⠀⠀⠈⠉⠛⢷⡄
⣿⠀⢀⣄⢀⣠⣤⣄⡀⣠⡀⠀⣿
⢻⣄⠘⠋⡞⠉⢤⠉⢳⠙⠃⢠⡿
⣼⠃⠀⠀⠳⠤⠬⠤⠞⠀⠀⠘⣷
⢿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡿
⢸⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡇
⢸⡅⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡿`;

export default function Home(): ReactElement {
  return (
    <section className="page">
      <h2>Home</h2>
      <p>Welcome to TestLlama. Ensuring you never get TestRailed again ❤️</p>
      <pre className="home-llama" aria-hidden="true">{LLAMA_ASCII}</pre>
    </section>
  );
}
