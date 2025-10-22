#!/bin/bash
################################################################################
# Blue-Green Deployment Script
# Implements zero-downtime deployment with automated traffic switching
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-production}"
VERSION="${2:-latest}"

echo "Starting blue-green deployment for $ENVIRONMENT environment..."

# Determine current active color
CURRENT=$(kubectl get service ish-api-active -n ish-automation-${ENVIRONMENT} -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo "blue")
NEW=$([[ "$CURRENT" == "blue" ]] && echo "green" || echo "blue")

echo "Current active: $CURRENT"
echo "Deploying to: $NEW"

# Deploy new version
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ish-api-${NEW}
  namespace: ish-automation-${ENVIRONMENT}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ish-api
      color: ${NEW}
  template:
    metadata:
      labels:
        app: ish-api
        color: ${NEW}
    spec:
      containers:
      - name: api
        image: ghcr.io/ish-automation/ish-automation:${VERSION}
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 20
EOF

# Wait for rollout to complete
echo "Waiting for new deployment to be ready..."
kubectl rollout status deployment/ish-api-${NEW} -n ish-automation-${ENVIRONMENT} --timeout=5m

# Run health checks
echo "Running health checks..."
sleep 10

POD=$(kubectl get pod -n ish-automation-${ENVIRONMENT} -l color=${NEW} -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- wget -q -O- http://localhost:3000/health || {
    echo "Health check failed, rolling back..."
    kubectl delete deployment ish-api-${NEW} -n ish-automation-${ENVIRONMENT}
    exit 1
}

# Switch traffic to new deployment
echo "Switching traffic to new deployment..."
kubectl patch service ish-api-active -n ish-automation-${ENVIRONMENT} -p "{\"spec\":{\"selector\":{\"color\":\"${NEW}\"}}}"

# Wait and verify
sleep 30

# Delete old deployment
echo "Removing old deployment..."
kubectl delete deployment ish-api-${CURRENT} -n ish-automation-${ENVIRONMENT} || true

echo "Blue-green deployment completed successfully!"
