# Contributing to Crayon

We welcome contributions to make Crayon the ultimate autonomous terminal AI!

## Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mithun0524/crayon.git
   cd crayon
   ```

2. **Install dependencies:**
   Crayon uses `pnpm` as its package manager.
   ```bash
   npm install -g pnpm
   pnpm install
   ```

3. **Build the workspace:**
   ```bash
   pnpm build
   ```

4. **Run the CLI locally:**
   You can run the development version of the CLI directly using `tsx`:
   ```bash
   cd packages/cli
   pnpm dev chat
   ```

## Pull Request Process

1. Create a new feature branch (`git checkout -b feature/amazing-feature`)
2. Make your changes across the workspace.
3. Ensure all tests pass (`pnpm test`)
4. Commit your changes.
5. Push to the branch and open a Pull Request!
