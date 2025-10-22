#!/bin/bash
################################################################################
# Rollback Script
# Rolls back to previous deployment version
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-production}"

echo "Starting rollback for $ENVIRONMENT environment..."

# Get previous deployment
PREVIOUS_DEPLOYMENT=$(kubectl rollout history deployment/ish-api -n ish-automation-${ENVIRONMENT} | tail -2 | head -1 | awk '{print $1}')

echo "Rolling back to deployment revision: $PREVIOUS_DEPLOYMENT"

# Perform rollback
kubectl rollout undo deployment/ish-api -n ish-automation-${ENVIRONMENT}
kubectl rollout undo deployment/ish-web -n ish-automation-${ENVIRONMENT}
kubectl rollout undo deployment/ish-pwa -n ish-automation-${ENVIRONMENT}

# Wait for rollback to complete
echo "Waiting for rollback to complete..."
kubectl rollout status deployment/ish-api -n ish-automation-${ENVIRONMENT} --timeout=5m
kubectl rollout status deployment/ish-web -n ish-automation-${ENVIRONMENT} --timeout=5m
kubectl rollout status deployment/ish-pwa -n ish-automation-${ENVIRONMENT} --timeout=5m

# Verify health
echo "Verifying service health..."
sleep 10

POD=$(kubectl get pod -n ish-automation-${ENVIRONMENT} -l app=ish-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- wget -q -O- http://localhost:3000/health || {
    echo "Health check failed after rollback!"
    exit 1
}

echo "Rollback completed successfully!"

# Create rollback record
cat > "logs/rollback_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "previous_revision": "$PREVIOUS_DEPLOYMENT",
  "status": "success",
  "initiated_by": "${USER:-unknown}"
}
EOF
