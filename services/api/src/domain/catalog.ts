import type { DeviceModel } from '@provisioning/contracts';

/**
 * Device catalog. Generic models only. It changes with a release, not at
 * runtime, so it lives in code rather than in the table.
 */
export const DEVICE_CATALOG: readonly DeviceModel[] = [
  {
    id: 'desk-d200',
    name: 'D200 desk phone',
    kind: 'desk',
    description: 'Two-line desk phone with a monochrome display.',
    requiresMac: true,
  },
  {
    id: 'desk-d400',
    name: 'D400 color desk phone',
    kind: 'desk',
    description: 'Six-line desk phone with a color display and busy-lamp keys.',
    requiresMac: true,
  },
  {
    id: 'conf-c100',
    name: 'C100 conference phone',
    kind: 'conference',
    description: 'Conference room speakerphone for rooms up to 12 people.',
    requiresMac: true,
  },
  {
    id: 'dect-h300',
    name: 'H300 DECT handset',
    kind: 'dect',
    description: 'Cordless handset. Registers to the site DECT base station, so no MAC is needed.',
    requiresMac: false,
  },
  {
    id: 'softphone',
    name: 'Softphone',
    kind: 'softphone',
    description: 'Desktop and mobile app. Nothing to ship or configure.',
    requiresMac: false,
  },
];

export function findDevice(id: string | null | undefined): DeviceModel | undefined {
  return id ? DEVICE_CATALOG.find((d) => d.id === id) : undefined;
}
