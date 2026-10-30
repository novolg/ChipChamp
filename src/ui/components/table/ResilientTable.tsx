import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import { Table } from './Table';

const TableScene = lazy(() => import('./TableScene'));

class GraphicsBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** The hand stays visible and playable while optional graphics download or fail. */
export function ResilientTable(props: ComponentProps<typeof Table>) {
  const fallback = <Table {...props} />;
  return (
    <GraphicsBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <TableScene {...props} />
      </Suspense>
    </GraphicsBoundary>
  );
}
