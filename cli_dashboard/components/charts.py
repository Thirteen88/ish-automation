"""
Chart and Visualization Components for CLI Dashboard
Provides ASCII charts and historical data visualization
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from collections import deque
import math

from core.data_manager import HistoricalDataPoint, DashboardData
from core.config import DashboardConfig
from utils.logger import get_logger

logger = get_logger(__name__)

class ASCIIChart:
    """ASCII chart generator for terminal display"""

    def __init__(self, width: int = 60, height: int = 10):
        self.width = width
        self.height = height

    def create_line_chart(
        self,
        data_points: List[Tuple[datetime, float]],
        title: str = "",
        y_label: str = "",
        x_label: str = ""
    ) -> str:
        """Create ASCII line chart"""
        if not data_points:
            return f"{title}\n{'No data available'}"

        # Extract values
        values = [point[1] for point in data_points]
        if not values:
            return f"{title}\n{'No data available'}"

        # Calculate chart dimensions
        min_val = min(values)
        max_val = max(values)

        if max_val == min_val:
            max_val = min_val + 1

        # Normalize values to chart height
        normalized_values = [
            int((val - min_val) / (max_val - min_val) * (self.height - 1))
            for val in values
        ]

        # Create chart grid
        chart_lines = []

        # Add title
        if title:
            chart_lines.append(f"{title}")
            chart_lines.append("-" * len(title))

        # Add Y-axis labels and chart rows
        for row in range(self.height - 1, -1, -1):
            line = ""
            # Y-axis label
            if row == self.height - 1:
                y_val = f"{max_val:.1f}"
            elif row == 0:
                y_val = f"{min_val:.1f}"
            else:
                y_val = f"{(min_val + (max_val - min_val) * row / (self.height - 1)):.1f}"

            line += f"{y_val:>6} │"

            # Add chart points
            for col, normalized_val in enumerate(normalized_values):
                if col >= self.width:
                    break

                if normalized_val == row:
                    line += "●"
                elif normalized_val > row:
                    line += "│"
                else:
                    line += " "

            chart_lines.append(line)

        # Add X-axis
        x_axis = "       └" + "─" * min(self.width, len(normalized_values))
        chart_lines.append(x_axis)

        # Add X-axis label
        if x_label:
            chart_lines.append(f"{x_label:^{self.width + 8}}")

        return "\n".join(chart_lines)

    def create_bar_chart(
        self,
        data: Dict[str, float],
        title: str = "",
        max_bars: int = 10
    ) -> str:
        """Create ASCII bar chart"""
        if not data:
            return f"{title}\n{'No data available'}"

        # Sort data and limit number of bars
        sorted_items = sorted(data.items(), key=lambda x: x[1], reverse=True)[:max_bars]

        if not sorted_items:
            return f"{title}\n{'No data available'}"

        # Calculate dimensions
        max_value = max(item[1] for item in sorted_items)
        bar_width = self.width - 15  # Leave space for labels

        chart_lines = []

        # Add title
        if title:
            chart_lines.append(f"{title}")
            chart_lines.append("-" * len(title))

        # Create bars
        for label, value in sorted_items:
            # Calculate bar length
            bar_length = int((value / max_value) * bar_width) if max_value > 0 else 0
            bar = "█" * bar_length

            # Format label and value
            label_text = label[:12] + "..." if len(label) > 15 else label
            value_text = f"{value:.1f}"

            line = f"{label_text:>15} │{bar:<{bar_width}} {value_text:>6}"
            chart_lines.append(line)

        return "\n".join(chart_lines)

    def create_sparkline(self, values: List[float], width: int = 20) -> str:
        """Create sparkline (mini chart)"""
        if not values or len(values) < 2:
            return "▁" * width

        # Normalize values
        min_val = min(values)
        max_val = max(values)

        if max_val == min_val:
            return "▄" * width

        # Sparkline characters
        spark_chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

        # Generate sparkline
        sparkline = ""
        for val in values:
            normalized = (val - min_val) / (max_val - min_val)
            char_index = min(int(normalized * len(spark_chars)), len(spark_chars) - 1)
            sparkline += spark_chars[char_index]

        return sparkline[:width]

class PerformanceCharts:
    """Performance visualization charts"""

    def __init__(self, config: DashboardConfig):
        self.config = config
        self.ascii_chart = ASCIIChart(width=50, height=8)

    def create_response_time_chart(self, historical_data: List[HistoricalDataPoint]) -> str:
        """Create response time chart"""
        if not historical_data:
            return "Response Time\nNo historical data available"

        # Extract data points
        data_points = [(point.timestamp, point.average_response_time) for point in historical_data]

        return self.ascii_chart.create_line_chart(
            data_points,
            title="Response Time Trend",
            y_label="Time (s)",
            x_label="Time"
        )

    def create_success_rate_chart(self, historical_data: List[HistoricalDataPoint]) -> str:
        """Create success rate chart"""
        if not historical_data:
            return "Success Rate\nNo historical data available"

        # Extract data points
        data_points = [(point.timestamp, point.success_rate) for point in historical_data]

        return self.ascii_chart.create_line_chart(
            data_points,
            title="Success Rate Trend",
            y_label="Rate (%)",
            x_label="Time"
        )

    def create_instance_health_chart(self, data: DashboardData) -> str:
        """Create instance health distribution chart"""
        if not data.instances:
            return "Instance Health\nNo instance data available"

        # Count instances by health status
        health_counts = {
            'Healthy': sum(1 for i in data.instances if i.is_healthy),
            'Unhealthy': sum(1 for i in data.instances if not i.is_healthy and i.is_active),
            'Inactive': sum(1 for i in data.instances if not i.is_active)
        }

        return self.ascii_chart.create_bar_chart(
            health_counts,
            title="Instance Health Distribution"
        )

    def create_provider_load_chart(self, data: DashboardData) -> str:
        """Create provider load chart"""
        if not data.instances:
            return "Provider Load\nNo instance data available"

        # Calculate load by provider
        provider_load = {}
        for instance in data.instances:
            provider = instance.provider_type.upper()
            if provider not in provider_load:
                provider_load[provider] = 0
            provider_load[provider] += instance.current_load

        return self.ascii_chart.create_bar_chart(
            provider_load,
            title="Current Load by Provider"
        )

    def create_request_volume_chart(self, historical_data: List[HistoricalDataPoint]) -> str:
        """Create request volume chart"""
        if not historical_data:
            return "Request Volume\nNo historical data available"

        # Extract data points
        data_points = [(point.timestamp, point.total_requests) for point in historical_data]

        return self.ascii_chart.create_line_chart(
            data_points,
            title="Request Volume Trend",
            y_label="Requests",
            x_label="Time"
        )

    def create_error_rate_chart(self, historical_data: List[HistoricalDataPoint]) -> str:
        """Create error rate chart"""
        if not historical_data:
            return "Error Rate\nNo historical data available"

        # Extract data points
        data_points = [(point.timestamp, point.error_rate) for point in historical_data]

        return self.ascii_chart.create_line_chart(
            data_points,
            title="Error Rate Trend",
            y_label="Rate (%)",
            x_label="Time"
        )

    def create_provider_performance_chart(self, data: DashboardData) -> str:
        """Create provider performance comparison chart"""
        if not data.instances:
            return "Provider Performance\nNo instance data available"

        # Calculate average performance by provider
        provider_stats = {}
        for instance in data.instances:
            provider = instance.provider_type.upper()
            if provider not in provider_stats:
                provider_stats[provider] = {
                    'response_times': [],
                    'success_rates': []
                }
            provider_stats[provider]['response_times'].append(instance.average_response_time)
            provider_stats[provider]['success_rates'].append(instance.success_rate)

        # Calculate averages
        provider_avg = {}
        for provider, stats in provider_stats.items():
            avg_response = sum(stats['response_times']) / len(stats['response_times'])
            avg_success = sum(stats['success_rates']) / len(stats['success_rates'])
            # Combined performance score (lower is better for response time)
            provider_avg[provider] = avg_success / (avg_response + 0.1)

        return self.ascii_chart.create_bar_chart(
            provider_avg,
            title="Provider Performance Score",
            max_bars=8
        )

    def create_instance_metrics_sparklines(self, instances: List) -> Dict[str, str]:
        """Create sparklines for instance metrics"""
        sparklines = {}

        if not instances:
            return sparklines

        # Response time sparkline
        response_times = [i.average_response_time for i in instances[:20]]
        sparklines['response_time'] = self.ascii_chart.create_sparkline(response_times)

        # Success rate sparkline
        success_rates = [i.success_rate for i in instances[:20]]
        sparklines['success_rate'] = self.ascii_chart.create_sparkline(success_rates)

        # Load sparkline
        loads = [(i.current_load / i.max_concurrent_requests * 100) if i.max_concurrent_requests > 0 else 0
                for i in instances[:20]]
        sparklines['load'] = self.ascii_chart.create_sparkline(loads)

        return sparklines

class DashboardVisualization:
    """Main dashboard visualization coordinator"""

    def __init__(self, config: DashboardConfig):
        self.config = config
        self.charts = PerformanceCharts(config)

    def generate_charts_panel(self, data: DashboardData, historical_data: List[HistoricalDataPoint]) -> Dict[str, str]:
        """Generate all charts for the dashboard"""
        charts = {}

        try:
            # Instance health chart
            charts['instance_health'] = self.charts.create_instance_health_chart(data)

            # Provider load chart
            charts['provider_load'] = self.charts.create_provider_load_chart(data)

            # Performance charts (if historical data available)
            if historical_data and len(historical_data) > 1:
                charts['response_time'] = self.charts.create_response_time_chart(historical_data)
                charts['success_rate'] = self.charts.create_success_rate_chart(historical_data)
                charts['request_volume'] = self.charts.create_request_volume_chart(historical_data)
                charts['error_rate'] = self.charts.create_error_rate_chart(historical_data)

            # Provider performance comparison
            charts['provider_performance'] = self.charts.create_provider_performance_chart(data)

            # Sparklines for top instances
            if data.instances:
                charts['sparklines'] = self.charts.create_instance_metrics_sparklines(data.instances)

        except Exception as e:
            logger.error(f"Error generating charts: {e}")
            charts['error'] = f"Chart generation error: {e}"

        return charts

    def format_chart_for_display(self, chart_text: str, max_width: int = 80) -> str:
        """Format chart text for display within width constraints"""
        if not chart_text:
            return ""

        lines = chart_text.split('\n')
        formatted_lines = []

        for line in lines:
            if len(line) > max_width:
                # Truncate long lines
                formatted_lines.append(line[:max_width-3] + "...")
            else:
                formatted_lines.append(line)

        return '\n'.join(formatted_lines)

    def get_chart_summary(self, charts: Dict[str, str]) -> Dict[str, Any]:
        """Get summary information about generated charts"""
        summary = {
            'total_charts': len(charts),
            'available_charts': list(charts.keys()),
            'has_historical_data': any('trend' in chart.lower() or 'volume' in chart.lower()
                                     for chart in charts.keys()),
            'has_performance_data': 'provider_performance' in charts,
            'has_health_data': 'instance_health' in charts,
            'has_sparklines': 'sparklines' in charts
        }

        return summary