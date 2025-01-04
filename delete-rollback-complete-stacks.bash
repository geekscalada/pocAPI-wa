#!/bin/bash
for stack in $(aws cloudformation list-stacks --query "StackSummaries[?StackStatus=='ROLLBACK_COMPLETE'].StackName" --output text); do
  echo "Eliminando stack: $stack"
  aws cloudformation delete-stack --stack-name $stack
done
