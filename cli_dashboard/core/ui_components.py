"""
UI Components for CLI Dashboard
Rich-based and basic terminal UI components
"""
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict

try:
    from rich.console import Console
    from rich.layout import Layout
    from rich.panel import Panel
    from rich.table import Table
    from rich.progress import Progress, BarColumn, TextColumn
    from rich.text import Text
    from rich.align import Align
    from rich.columns import Columns
    from rich.rule import Rule
    from rich.spinner import Spinner
    from rich.live import Live
    from rich.box import ROUNDED, DOUBLE
    from rich.status import Status
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

from .config import DashboardConfig
from .data_manager import DashboardData
from utils.logger import get_logger

logger = get_logger(__name__)

class BaseDashboardUI:
    """Base class for dashboard UI components"""

    def __init__(self, config: DashboardConfig):
        self.config = config
        self.console = Console() if RICH_AVAILABLE else None

    def initialize(self):
        """Initialize UI components"""
        pass

    def cleanup(self):
        """Cleanup UI resources"""
        if self.console:
            self.console.clear()

    def generate_layout(
        self,
        data: DashboardData,
        last_update: datetime,
        performance_stats: Dict[str, Any]
    ) -> Any:
        """Generate the main dashboard layout"""
        raise NotImplementedError

    def print_display(self, layout):
        """Print the display (for non-rich UI)"""
        raise NotImplementedError

class DashboardUI(BaseDashboardUI):
    """Rich-based dashboard UI"""

    def __init__(self, config: DashboardConfig):
        super().__init__(config)
        self.console = Console()
        self.layout = Layout()

    def initialize(self):
        """Initialize Rich layout"""
        self.layout.split_column(
            Layout(name="header", size=3),
            Layout(name="main"),
            Layout(name="footer", size=3)
        )

        self.layout["main"].split_row(
            Layout(name="left", ratio=2),
            Layout(name="right", ratio=1)
        )

        self.layout["left"].split_column(
            Layout(name="instances", ratio=2),
            Layout(name="charts", ratio=1)
        )

        self.layout["right"].split_column(
            Layout(name="system", ratio=1),
            Layout(name="alerts", ratio=1),
            Layout(name="external", ratio=1)
        )

    def generate_layout(
        self,
        data: DashboardData,
        last_update: datetime,
        performance_stats: Dict[str, Any]
    ) -> Layout:
        """Generate Rich layout"""
        # Update layout components
        self.layout["header"].update(self._create_header(data, last_update, performance_stats))
        self.layout["instances"].update(self._create_instances_panel(data))
        self.layout["charts"].update(self._create_charts_panel(data))
        self.layout["system"].update(self._create_system_panel(data, performance_stats))
        self.layout["alerts"].update(self._create_alerts_panel(data))
        self.layout["external"].update(self._create_external_panel(data))
        self.layout["footer"].update(self._create_footer())

        return self.layout

    def _create_header(self, data: DashboardData, last_update: datetime, perf_stats: Dict[str, Any]) -> Panel:
        """Create header panel"""
        title = "[bold blue]88 3ee AI Dashboard[/bold blue]"
        subtitle = f"Multi-Instance AI Platform by Thirteen 88 - Last Update: {last_update.strftime('%H:%M:%S')}"

        if perf_stats:
            perf_text = f"Updates: {perf_stats.get('total_updates', 0)} | Success Rate: {perf_stats.get('success_rate', 0):.1f}% | Avg Update: {perf_stats.get('avg_update_time', 0):.3f}s"
        else:
            perf_text = "Initializing..."

        header_content = f"{title}\n{subtitle}\n[dim]{perf_text}[/dim]"

        return Panel(
            Align.center(header_content),
            box=DOUBLE,
            style="blue"
        )

    def _create_instances_panel(self, data: DashboardData) -> Panel:
        """Create instances panel"""
        if not data.instances:
            return Panel(
                "[yellow]No instances data available[/yellow]",
                title="📊 AI Instances",
                box=ROUNDED
            )

        # Create instances table
        table = Table(show_header=True, header_style="bold magenta", box=None)
        table.add_column("Instance", style="cyan", width=20)
        table.add_column("Provider", style="green", width=12)
        table.add_column("Status", width=10)
        table.add_column("Health", width=8)
        table.add_column("Load", width=8)
        table.add_column("Success %", width=10)
        table.add_column("Response", width=10)

        # Sort instances by status and performance
        sorted_instances = sorted(
            data.instances,
            key=lambda x: (0 if x.is_healthy else 1, x.success_rate, x.average_response_time)
        )

        for instance in sorted_instances[:10]:  # Show top 10
            # Status styling
            status_text = instance.status
            if instance.is_healthy:
                status_style = "green"
            elif instance.status == "unhealthy":
                status_style = "red"
            else:
                status_style = "yellow"

            # Health indicator
            health_text = "✓" if instance.is_healthy else "✗"
            health_style = "green" if instance.is_healthy else "red"

            # Load bar
            load_percentage = (instance.current_load / instance.max_concurrent_requests * 100) if instance.max_concurrent_requests > 0 else 0
            if load_percentage > 80:
                load_style = "red"
            elif load_percentage > 60:
                load_style = "yellow"
            else:
                load_style = "green"

            load_text = f"{load_percentage:.0f}%"

            # Success rate styling
            if instance.success_rate >= 95:
                success_style = "green"
            elif instance.success_rate >= 85:
                success_style = "yellow"
            else:
                success_style = "red"

            # Response time styling
            if instance.average_response_time <= 1.0:
                response_style = "green"
            elif instance.average_response_time <= 2.0:
                response_style = "yellow"
            else:
                response_style = "red"

            table.add_row(
                instance.instance_name[:18],
                instance.provider_type.upper(),
                f"[{status_style}]{status_text}[/{status_style}]",
                f"[{health_style}]{health_text}[/{health_style}]",
                f"[{load_style}]{load_text}[/{load_style}]",
                f"[{success_style}]{instance.success_rate:.1f}%[/{success_style}]",
                f"[{response_style}]{instance.average_response_time:.2f}s[/{response_style}]"
            )

        # Summary stats
        total_instances = len(data.instances)
        healthy_instances = sum(1 for i in data.instances if i.is_healthy)
        active_instances = sum(1 for i in data.instances if i.is_active)

        summary_text = f"Total: {total_instances} | Healthy: {healthy_instances} | Active: {active_instances}"

        return Panel(
            table,
            title=f"📊 AI Instances ({summary_text})",
            box=ROUNDED
        )

    def _create_charts_panel(self, data: DashboardData) -> Panel:
        """Create charts panel"""
        # Provider distribution chart
        provider_counts = defaultdict(int)
        for instance in data.instances:
            provider_counts[instance.provider_type] += 1

        if provider_counts:
            chart_lines = ["[bold]Provider Distribution:[/bold]"]
            total = sum(provider_counts.values())

            for provider, count in sorted(provider_counts.items()):
                percentage = (count / total * 100) if total > 0 else 0
                bar_length = int(percentage / 5)  # 20 characters max
                bar = "█" * bar_length
                chart_lines.append(f"{provider.upper():12} ┤ {bar:<20} {count} ({percentage:.1f}%)")
        else:
            chart_lines = ["[yellow]No data available[/yellow]"]

        # Performance summary
        if data.instances:
            avg_response_time = sum(i.average_response_time for i in data.instances) / len(data.instances)
            avg_success_rate = sum(i.success_rate for i in data.instances) / len(data.instances)

            chart_lines.extend([
                "",
                f"[bold]Performance Summary:[/bold]",
                f"Avg Response: {avg_response_time:.2f}s",
                f"Avg Success: {avg_success_rate:.1f}%"
            ])

        return Panel(
            "\n".join(chart_lines),
            title="📈 Analytics",
            box=ROUNDED
        )

    def _create_system_panel(self, data: DashboardData, perf_stats: Dict[str, Any]) -> Panel:
        """Create system status panel"""
        # System metrics
        system_info = []

        if data.system_status:
            instances = data.system_status.get('instances', {})
            system_info.append(f"[bold]Instances:[/bold] {instances.get('total', 0)} total")
            system_info.append(f"  Healthy: {instances.get('healthy', 0)}")
            system_info.append(f"  Unhealthy: {instances.get('unhealthy', 0)}")

            services = data.system_status.get('services', {})
            system_info.append(f"[bold]Services:[/bold]")
            system_info.append(f"  Health Monitor: {'✓' if services.get('health_monitoring_active') else '✗'}")
            system_info.append(f"  Auto Scaling: {'✓' if services.get('auto_scaling_active') else '✗'}")

        # Performance stats
        if perf_stats:
            system_info.append(f"[bold]Performance:[/bold]")
            system_info.append(f"  Updates: {perf_stats.get('total_updates', 0)}")
            system_info.append(f"  Success Rate: {perf_stats.get('success_rate', 0):.1f}%")
            system_info.append(f"  Avg Update: {perf_stats.get('avg_update_time', 0):.3f}s")

        if not system_info:
            system_info = ["[yellow]No system data available[/yellow]"]

        return Panel(
            "\n".join(system_info),
            title="🖥️ System Status",
            box=ROUNDED
        )

    def _create_alerts_panel(self, data: DashboardData) -> Panel:
        """Create alerts panel"""
        if not data.alerts:
            return Panel(
                "[green]✓ No active alerts[/green]",
                title="🚨 Alerts",
                box=ROUNDED
            )

        # Show recent alerts
        recent_alerts = sorted(data.alerts, key=lambda x: x.get('timestamp', datetime.min), reverse=True)[:5]

        alert_lines = []
        for alert in recent_alerts:
            severity = alert.get('severity', 'info')
            title = alert.get('title', 'Unknown Alert')

            if severity == 'error':
                style = "red"
                icon = "❌"
            elif severity == 'warning':
                style = "yellow"
                icon = "⚠️"
            else:
                style = "blue"
                icon = "ℹ️"

            alert_lines.append(f"[{style}]{icon} {title}[/{style}]")

        return Panel(
            "\n".join(alert_lines),
            title=f"🚨 Alerts ({len(data.alerts)} active)",
            box=ROUNDED
        )

    def _create_external_panel(self, data: DashboardData) -> Panel:
        """Create external agents panel"""
        if not data.external_agents:
            return Panel(
                "[yellow]No external agents data[/yellow]",
                title="🤖 External Agents",
                box=ROUNDED
            )

        agents_info = []

        # Summary stats
        total = data.external_agents.get('total', 0)
        active = data.external_agents.get('active', 0)
        busy = data.external_agents.get('busy', 0)
        offline = data.external_agents.get('offline', 0)

        agents_info.append(f"[bold]Summary:[/bold] {total} total agents")
        agents_info.append(f"  Active: {active} | Busy: {busy} | Offline: {offline}")

        # Individual agents
        details = data.external_agents.get('details', {})
        if details:
            agents_info.append("")
            agents_info.append("[bold]Individual Agents:[/bold]")

            for agent_id, agent_data in list(details.items())[:3]:  # Show top 3
                name = agent_data.get('name', agent_id)
                status = agent_data.get('status', 'unknown')
                connection = agent_data.get('connection_status', 'unknown')

                if connection == 'connected':
                    conn_style = "green"
                    conn_icon = "✓"
                else:
                    conn_style = "red"
                    conn_icon = "✗"

                agents_info.append(f"  {name}: {status} [{conn_style}]{conn_icon}[/{conn_style}]")

        return Panel(
            "\n".join(agents_info),
            title="🤖 External Agents",
            box=ROUNDED
        )

    def _create_footer(self) -> Panel:
        """Create footer panel"""
        footer_text = "[dim]Press Ctrl+C to exit | Refresh every {}s | {}[/dim]".format(
            self.config.refresh_rate,
            "Debug Mode" if self.config.debug else "Production Mode"
        )

        return Panel(
            Align.center(footer_text),
            box=ROUNDED,
            style="dim"
        )

class BasicDashboardUI(BaseDashboardUI):
    """Basic terminal UI (fallback when Rich is not available)"""

    def generate_layout(
        self,
        data: DashboardData,
        last_update: datetime,
        performance_stats: Dict[str, Any]
    ) -> str:
        """Generate basic terminal layout"""
        output = []

        # Clear screen
        output.append('\033[2J\033[H')

        # Header
        output.append("=" * 80)
        output.append("88 3ee AI Dashboard - Multi-Instance AI Platform by Thirteen 88")
        output.append(f"Last Update: {last_update.strftime('%Y-%m-%d %H:%M:%S')}")
        output.append("=" * 80)
        output.append("")

        # Instances summary
        if data.instances:
            output.append("AI INSTANCES")
            output.append("-" * 40)

            total_instances = len(data.instances)
            healthy_instances = sum(1 for i in data.instances if i.is_healthy)
            active_instances = sum(1 for i in data.instances if i.is_active)

            output.append(f"Total: {total_instances} | Healthy: {healthy_instances} | Active: {active_instances}")
            output.append("")

            # Instance details (top 5)
            sorted_instances = sorted(
                data.instances,
                key=lambda x: (0 if x.is_healthy else 1, x.success_rate, x.average_response_time)
            )

            output.append(f"{'Instance':<20} {'Provider':<10} {'Status':<10} {'Health':<8} {'Load':<8} {'Success%':<10} {'Response':<10}")
            output.append("-" * 80)

            for instance in sorted_instances[:5]:
                health = "OK" if instance.is_healthy else "FAIL"
                load_pct = (instance.current_load / instance.max_concurrent_requests * 100) if instance.max_concurrent_requests > 0 else 0

                output.append(f"{instance.instance_name[:18]:<20} {instance.provider_type.upper():<10} {instance.status:<10} {health:<8} {load_pct:<8.0f} {instance.success_rate:<10.1f} {instance.average_response_time:<10.2f}s")

            output.append("")

        # System status
        if data.system_status:
            output.append("SYSTEM STATUS")
            output.append("-" * 40)

            instances = data.system_status.get('instances', {})
            output.append(f"Instances: {instances.get('total', 0)} total, {instances.get('healthy', 0)} healthy")

            services = data.system_status.get('services', {})
            output.append(f"Health Monitor: {'Active' if services.get('health_monitoring_active') else 'Inactive'}")
            output.append(f"Auto Scaling: {'Active' if services.get('auto_scaling_active') else 'Inactive'}")
            output.append("")

        # Alerts
        if data.alerts:
            output.append(f"ALERTS ({len(data.alerts)} active)")
            output.append("-" * 40)

            for alert in data.alerts[:3]:
                severity = alert.get('severity', 'info')
                title = alert.get('title', 'Unknown Alert')
                output.append(f"{severity.upper()}: {title}")

            output.append("")

        # Performance stats
        if performance_stats:
            output.append("PERFORMANCE")
            output.append("-" * 40)
            output.append(f"Updates: {performance_stats.get('total_updates', 0)}")
            output.append(f"Success Rate: {performance_stats.get('success_rate', 0):.1f}%")
            output.append(f"Avg Update Time: {performance_stats.get('avg_update_time', 0):.3f}s")
            output.append("")

        # Footer
        output.append("-" * 80)
        output.append("Press Ctrl+C to exit")

        return "\n".join(output)

    def print_display(self, layout: str):
        """Print the display to terminal"""
        print(layout)