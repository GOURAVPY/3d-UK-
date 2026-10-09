export interface Station { id: string; name: string; lat: number; lon: number }
export interface Line {
  id: string;
  name: string;
  mode: string;
  colour: string;
  paths: [number, number][][];
  stations: Station[];
}
