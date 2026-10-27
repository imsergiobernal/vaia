// Compiled from the isolated consumer to check the declarations in the tarball.
import { createClient, type VaiaClient, type StudysetList } from '@imsergiobernal/vaia-sdk';

const client: VaiaClient = createClient({ token: 'type-check' });
const studysets: Promise<StudysetList> = client.studysets.list({ isArchived: false });
void studysets;
