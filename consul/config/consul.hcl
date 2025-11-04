# Consul Configuration for ISH Chat System
# High Availability Cluster Configuration

datacenter = "ish-chat-dc1"
data_dir = "/consul/data"
log_level = "INFO"
server = true
bootstrap_expect = 3
ui = true

# Bind to all interfaces
bind_addr = "0.0.0.0"

# Client address for RPC
client_addr = "0.0.0.0"

# Cluster configuration
retry_join = [
  "consul-server-1:8301",
  "consul-server-2:8301", 
  "consul-server-3:8301"
]

# Ports configuration
ports {
  dns = 8600
  http = 8500
  https = -1
  grpc = 8502
  grpc_tls = 8503
  server = 8300
  serf_lan = 8301
  serf_wan = 8302
}

# ACL configuration for security
acl = {
  enabled = true
  default_policy = "deny"
  enable_token_persistence = true
  tokens {
    master = "${CONSUL_MASTER_TOKEN}"
    agent = "${CONSUL_AGENT_TOKEN}"
  }
}

# TLS configuration
tls {
  https = false
  rpc = false
  verify_incoming = false
  verify_outgoing = false
  verify_server_hostname = false
}

# Connect service mesh (optional for future use)
connect {
  enabled = false
}

# Auto-encrypt
auto_encrypt {
  tls = true
}

# Performance tuning
performance {
  raft_multiplier = 1
  rpc_hold_timeout = "10s"
}

# Limits
limits {
  http_max_conns_per_client = 200
  http_max_conns_per_client_tls = 500
}

# Telemetry and monitoring
telemetry {
  disable_hostname = false
  enable_host_metrics = true
  prometheus_retention_time = "24h"
  enable_service_metrics = true
  enable_agent_metrics = true
}

# Event and command handling
disable_remote_exec = false
disable_update_check = true

# Logging
enable_syslog = false
syslog_facility = "LOCAL0"

# Leave on termination
leave_on_terminate = false
skip_leave_on_interrupt = true

# Health check configuration
check_update_interval = "30s"
disable_sync_remote_addr = false

# Service mesh gateway configuration (for future use)
gateways = {
  enabled = false
}

# API and UI configuration
addresses {
  http = "0.0.0.0"
  https = "0.0.0.0"
  grpc = "0.0.0.0"
  dns = "0.0.0.0"
}

# DNS configuration
recursors = ["8.8.8.8", "1.1.1.1"]
enable_truncate = true
only_passing = false
recursor_timeout = "2s"