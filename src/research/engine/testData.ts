/** 测试直接打包本地 JSON,不走网络 */
import archiveText from '../../../public/research/archive.json?raw'
import datasetText from '../../../public/research/dataset.json?raw'
import parityText from './__fixtures__/parity.json?raw'
import type { Dataset } from '../types'
import { parseDataset } from './loadDataset'

export const rawDataset = JSON.parse(datasetText) as Record<string, unknown>
export const rawArchive: unknown = JSON.parse(archiveText)
export const rawParity: unknown = JSON.parse(parityText)
export const dataset: Dataset = parseDataset(rawDataset)
