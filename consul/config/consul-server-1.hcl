# Consul Server 1 Configuration
datacenter = "ish-chat-dc1"
data_dir = "/consul/data"
log_level = "INFO"
server = true
bootstrap_expect = 3
ui = true

# Network configuration
bind_addr = "{{ GetInterfaceIP \"eth0\" }}"
client_addr = "0.0.0.0"

# Advertise address
advertise_addr = "{{ GetInterfaceIP \"eth0\" }}"

# Cluster configuration
retry_join = [
  "consul-server-2",
  "consul-server-3"
]

# Ports
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

# Performance tuning
performance {
  raft_multiplier = 1
}

# ACL configuration
acl = {
  enabled = true
  default_policy = "deny"
  enable_token_persistence = true
  down_policy = "extend-cache"
}

# Auto-encrypt
auto_encrypt {
  tls = true
}

# Telemetry
telemetry {
  enable_host_metrics = true
  prometheus_retention_time = "24h"
}

# Service mesh (disabled for now)
connect {
  enabled = false
}