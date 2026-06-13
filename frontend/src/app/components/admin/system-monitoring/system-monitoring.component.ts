import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface HealthData {
  status: string;
  timestamp: string;
  uptime: string;
  uptimeSeconds: number;
  version: string;
  node: string;
  memory: {
    rss: string;
    heapUsed: string;
    heapTotal: string;
    external: string;
  };
  database: {
    status: string;
    latencyMs: number | null;
  };
  socketIO: {
    connected: number;
  };
}

@Component({
  selector: 'app-system-monitoring',
  templateUrl: './system-monitoring.component.html'
})
export class SystemMonitoringComponent implements OnInit, OnDestroy {
  health: HealthData | null = null;
  loading = true;
  error = '';
  lastRefresh: Date | null = null;
  private refreshInterval: any;

  monitoringLinks = [
    {
      title: 'Real-Time Status Dashboard',
      description: 'Live server metrics — CPU, memory, response times, requests/sec, and status codes.',
      url: '/status',
      icon: 'bi-speedometer',
      color: 'primary',
      badge: 'Live Metrics',
      external: false
    },
    {
      title: 'Application Logs',
      description: 'Real-time streaming log viewer with search and highlight. View app and error logs.',
      url: '/logs',
      icon: 'bi-terminal-fill',
      color: 'success',
      badge: 'Frontail',
      external: false
    },
    {
      title: 'Health Check API',
      description: 'JSON health endpoint — database connectivity, memory usage, uptime, and Socket.IO status.',
      url: '/health',
      icon: 'bi-heart-pulse-fill',
      color: 'danger',
      badge: 'API',
      external: false
    },
    {
      title: 'Uptime Monitor',
      description: 'Uptime Kuma dashboard — track uptime history, latency, and incident timeline.',
      url: ':3001',
      icon: 'bi-graph-up-arrow',
      color: 'warning',
      badge: 'Uptime Kuma',
      external: true
    }
  ];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadHealth();
    this.refreshInterval = setInterval(() => this.loadHealth(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  loadHealth(): void {
    const baseUrl = environment.apiUrl.replace('/api', '');
    this.http.get<HealthData>(`${baseUrl}/health`).subscribe({
      next: (data) => {
        this.health = data;
        this.loading = false;
        this.error = '';
        this.lastRefresh = new Date();
      },
      error: (err) => {
        this.error = 'Unable to reach health endpoint';
        this.loading = false;
        this.lastRefresh = new Date();
      }
    });
  }

  getFullUrl(link: any): string {
    const baseUrl = environment.apiUrl.replace('/api', '');
    if (link.external) {
      // For port-based links like :3001
      const urlObj = new URL(baseUrl);
      return `${urlObj.protocol}//${urlObj.hostname}${link.url}`;
    }
    return `${baseUrl}${link.url}`;
  }

  getStatusClass(): string {
    if (!this.health) return 'secondary';
    return this.health.status === 'healthy' ? 'success' : 'danger';
  }

  getDbStatusClass(): string {
    if (!this.health) return 'secondary';
    return this.health.database.status === 'connected' ? 'success' : 'danger';
  }
}
