# #!/bin/bash


# USERS=$(aws iam list-users --query "Users[].UserName" --output text)

# for USER in $USERS; do
#     echo "Eliminando claves de acceso asociadas al usuario $USER"

    
#     ACCESS_KEYS=$(aws iam list-access-keys --user-name $USER --query "AccessKeyMetadata[].AccessKeyId" --output text)
#     for KEY in $ACCESS_KEYS; do
#         echo "Eliminando clave de acceso $KEY del usuario $USER"
#         aws iam delete-access-key --user-name $USER --access-key-id $KEY
#     done

#     echo "Eliminando políticas asociadas al usuario $USER"

    
#     POLICIES=$(aws iam list-attached-user-policies --user-name $USER --query "AttachedPolicies[].PolicyArn" --output text)
#     for POLICY in $POLICIES; do
#         echo "Desvinculando política $POLICY del usuario $USER"
#         aws iam detach-user-policy --user-name $USER --policy-arn $POLICY
#     done

    
#     INLINE_POLICIES=$(aws iam list-user-policies --user-name $USER --query "PolicyNames[]" --output text)
#     for INLINE_POLICY in $INLINE_POLICIES; do
#         echo "Eliminando política en línea $INLINE_POLICY del usuario $USER"
#         aws iam delete-user-policy --user-name $USER --policy-name $INLINE_POLICY
#     done

#     echo "Eliminando usuario $USER"
#     aws iam delete-user --user-name $USER
# done

# echo "Todos los usuarios han sido eliminados."
