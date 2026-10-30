import { Component, type ReactNode } from 'react';
import { useNavStore } from '../store/navStore';

/** A failed route chunk must leave a way back to the already-loaded club. */
export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="play-loading" role="alert">
        <h1>This screen couldn’t open.</h1>
        <p>Check your connection, then reload to try again.</p>
        <button className="btn btn-orange" onClick={() => window.location.reload()}>RELOAD</button>{' '}
        <button className="btn btn-dark" onClick={() => useNavStore.getState().go({ name: 'home' })}>BACK TO THE CLUB</button>
      </section>
    );
  }
}
