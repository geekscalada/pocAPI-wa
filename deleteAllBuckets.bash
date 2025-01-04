#!/bin/bash


# BUCKETS=$(aws s3api list-buckets --query "Buckets[].Name" --output text)


# for BUCKET in $BUCKETS; do
#     echo "Eliminando objetos del bucket $BUCKET"
#     aws s3 rm s3://$BUCKET --recursive

    
#     VERSIONING=$(aws s3api get-bucket-versioning --bucket $BUCKET --query "Status" --output text)
#     if [ "$VERSIONING" == "Enabled" ]; then
#         echo "Eliminando versiones del bucket $BUCKET"
#         aws s3api list-object-versions --bucket $BUCKET --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' | \
#         jq '.Objects' > objects.json
#         aws s3api delete-objects --bucket $BUCKET --delete file://objects.json
#         rm objects.json
#     fi

#     echo "Eliminando bucket $BUCKET"
#     aws s3api delete-bucket --bucket $BUCKET
# done

# echo "Todos los buckets han sido eliminados."
