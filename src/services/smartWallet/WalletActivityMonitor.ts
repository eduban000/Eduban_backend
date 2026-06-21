export class WalletActivityMonitor {
  constructor(config: any) {}
  getRecentActivity(walletAddress: string, limit: number): Promise<any[]> { return Promise.resolve([]); }
  getAlerts(walletAddress: string, acknowledged?: boolean): any[] { return []; }
}
