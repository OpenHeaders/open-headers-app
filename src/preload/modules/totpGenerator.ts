import timeUtils from './timeUtils';
import { TOTPGenerator } from '../../shared/totpGenerator';

const totpGenerator = new TOTPGenerator(() => timeUtils.now());
export { TOTPGenerator };
export default totpGenerator;
