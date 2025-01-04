# #!/bin/bash


# ROLES=$(aws iam list-roles --query "Roles[].RoleName" --output text)

# for ROLE in $ROLES; do
#     echo "Eliminando políticas asociadas al rol $ROLE"
    
    
#     POLICIES=$(aws iam list-attached-role-policies --role-name $ROLE --query "AttachedPolicies[].PolicyArn" --output text)
    
#     for POLICY in $POLICIES; do
#         echo "Desvinculando política $POLICY del rol $ROLE"
#         aws iam detach-role-policy --role-name $ROLE --policy-arn $POLICY
#     done

    
#     INLINE_POLICIES=$(aws iam list-role-policies --role-name $ROLE --query "PolicyNames[]" --output text)
#     for INLINE_POLICY in $INLINE_POLICIES; do
#         echo "Eliminando política en línea $INLINE_POLICY del rol $ROLE"
#         aws iam delete-role-policy --role-name $ROLE --policy-name $INLINE_POLICY
#     done

#     echo "Eliminando rol $ROLE"
#     aws iam delete-role --role-name $ROLE
# done

# echo "Todos los roles han sido eliminados."
