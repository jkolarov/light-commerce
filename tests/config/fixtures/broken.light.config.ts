// A light.config.ts with a mistake, imported by a test: importing it must throw LightConfigError.
import { defineLightConfig } from '../../../src/config'

import { validInput } from './validInput'

const input = validInput()
input.theme.colors.primary = 'not a colour'

export default defineLightConfig(input)
