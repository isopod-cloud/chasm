# Troubleshooting

Isopod Chasm is a complex and powerful tool that interacts with other complex and powerful tools. Therefore, we will not be able to describe every possible situation here. Nonetheless, if you get stuck while using Chasm, this document contains a list of suggestions to try. If after reading this entire document, you are still stuck, feel free to make an issue at [our Gitlab Issue tracker](https://gitlab.com/isopod-cloud/chasm/-/issues) and we will address it as soon as possible.

## Standing up a Mesh Network

- First off, before mentioning anything else. If you run into trouble, your first place to check should be the config.json file you are using. Make sure the id's, tags, IP addresses, regions, etc for the subscriptions, VPC's, subnets, etc are CORRECT. This alone can save you a ton of trouble!

- Next thing to check: via your cloud provider's command-line client or website, make sure the prerequisite resources are setup correctly, and that there aren't any existing resources that might conflict with things Chasm tries to create. If there are, you might need to manually remove those.

- If you are using multiple subscriptions, accounts, projects, etc within a cloud provider, but are getting error messages corresponding to the WRONG id, even though you set that id correctly in config.json, then you might need to change which subscription, account, project, etc is your primary one in your cloud provider command-line client or console website.

- If you are seeing error messages related to a VPC being attached to a Virtual Private Gateway (VPG), then you might need to go the the console website of the cloud provider and detach the VPC from the VPG.

- If you are seeing error messages pertaining to public IP Addresses, then you might need to go to the console site of the cloud provider and detach this IP address from the subnet and/or NIC, then delete it. It might also be helpful to, on the same console site, create a gateway subnet for the VPC if there isn't already one. If you choose to do this, then be sure to re-run `chasm find`, and update the vpcs in config.json with the details of this gateway subnet outputted to discovered.json before retrying the creation of the mesh network. Instructions for generating a discovered.json can be found in the [README](README.md).
