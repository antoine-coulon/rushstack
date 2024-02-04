// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { resolve } from 'path';
import { promisify } from 'util';

import webpack, { type Compiler, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalizationPlugin } from '../LocalizationPlugin';
import type { ILocalizationPluginOptions } from '../interfaces';
import { MemFSPlugin } from './MemFSPlugin';

async function testLocalizedRuntimeInner(minimize: boolean): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/a/package.json': '{ "name": "a", "sideEffects": ["entry.js", "async.js"] }',
      '/a/async1.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test, strings2.another);`,
      '/a/async2.js': `import strings1 from './strings1.resjson'; import strings2 from './strings2.resjson'; console.log(strings1.test + strings2.another);`,
      '/a/entrySingleChunk.js': `import(/* webpackChunkName: 'async1' */ './async1');`,
      '/a/entryTwoChunks.js': `import(/* webpackChunkName: 'async1' */ './async1');import(/* webpackChunkName: 'async2' */ './async2');`,
      '/a/strings1.resjson': `{"test":"blah","_test.comment":"A string"}`,
      '/a/strings2.resjson': `{"another":"something else","_another.comment":"Another string"}`
    },
    '/'
  );

  const resJsonLoader: string = resolve(__dirname, '../loaders/resjson-loader.js');
  const options: ILocalizationPluginOptions = {
    localizedData: {
      defaultLocale: {
        localeName: 'LOCALE1'
      },
      translatedStrings: {
        LOCALE2: {
          '/a/strings1.resjson': {
            test: 'baz'
          },
          '/a/strings2.resjson': {
            another: 'some random translation'
          }
        }
      }
    }
  };

  const localizationPlugin: LocalizationPlugin = new LocalizationPlugin(options);

  const compiler: Compiler = webpack({
    entry: {
      mainSingleChunk: '/a/entrySingleChunk.js',
      mainTwoChunks: '/a/entryTwoChunks.js'
    },
    output: {
      path: '/release',
      filename: '[name]-[locale]-[contenthash].js',
      chunkFilename: 'chunks/[name]-[locale]-[contenthash].js'
    },
    module: {
      rules: [
        {
          test: /\.resjson$/,
          use: {
            loader: resJsonLoader
          },
          type: 'javascript/esm',
          sideEffects: false
        }
      ]
    },
    optimization: {
      minimize,
      moduleIds: 'named'
    },
    context: '/',
    mode: 'production',
    plugins: [localizationPlugin, new MemFSPlugin(memoryFileSystem)]
  });

  const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
  await promisify(compiler.close.bind(compiler))();
  if (!stats) {
    throw new Error(`Expected stats`);
  }
  const { errors, warnings } = stats.toJson('errors-warnings');
  expect(errors).toMatchSnapshot('Errors');
  expect(warnings).toMatchSnapshot('Warnings');

  const results: {} = memoryFileSystem.toJSON('/release');
  expect(results).toMatchSnapshot('Content');
}

describe(LocalizationPlugin.name, () => {
  it('Handles async localized chunks (unminified)', async () => {
    await testLocalizedRuntimeInner(false);
  });

  it('Handles async localized chunks (minified)', async () => {
    await testLocalizedRuntimeInner(true);
  });
});
