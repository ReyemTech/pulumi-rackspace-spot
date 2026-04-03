export interface AutoscalingOutput {
  minNodes: number;
  maxNodes: number;
}

export interface TaintOutput {
  key: string;
  value?: string;
  effect: string;
}
