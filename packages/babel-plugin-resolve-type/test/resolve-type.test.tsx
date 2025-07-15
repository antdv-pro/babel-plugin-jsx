import { transformAsync } from '@babel/core';
// @ts-expect-error missing types
import typescript from '@babel/plugin-syntax-typescript';
import ResolveType from '../src';

async function transform(code: string): Promise<string> {
  const result = await transformAsync(code, {
    plugins: [[typescript, { isTSX: true }], ResolveType],
  });
  return result!.code!;
}

describe('resolve type', () => {
  describe('runtime props', () => {
    test('basic', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        interface Props {
          msg: string;
          optional?: boolean;
        }
        interface Props2 {
          set: Set<string>;
        }
        defineComponent((props: Props & Props2) => {
          return () => h('div', props.msg);
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('with static default value', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        defineComponent((props: { msg?: string } = { msg: 'hello' }) => {
          return () => h('div', props.msg);
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('with dynamic default value', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        const defaults = {}
        defineComponent((props: { msg?: string } = defaults) => {
          return () => h('div', props.msg);
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('with defineComponent props', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        interface Props {
          msg: string;
          optional?: boolean;
        }
        interface Props2 {
          set: Set<string>;
        }
        defineComponent<Props & Props2>((props) => {
          return () => h('div', props.msg);
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('with defineComponent not props', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        interface Props {
          msg: string;
          optional?: boolean;
        }
        interface Props2 {
          set: Set<string>;
        }
        defineComponent<Props & Props2>(() => {
          return () => h('div');
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('with defineComponent props default', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        interface Props {
          msg: string;
          optional?: boolean;
        }
        interface Props2 {
          set: Set<string>;
        }
        defineComponent<Props & Props2>((props = {msg:'11'}) => {
          return () => h('div', props.msg);
        })
        const a = {msg:'11'}
        defineComponent<Props>((props = a) => {
          return () => h('div', props.msg);
        })
        const b = {msg:'12'}
        defineComponent<Props>((props = b) => {
          return () => h('div', props.msg);
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('support setup object', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        interface Props {
          msg: string;
          optional?: boolean;
        }
        interface Props2 {
          set: Set<string>;
        }
        defineComponent<Props & Props2>({
          setup(props){
            // 这种情况下的默认值设置，以及类型的设置
          }
        })
        // 添加默认值的情况
        defineComponent<Props & Props2>({
          setup(props = {
            msg: 'hello'
          }){
            // 这种情况下的默认值设置，以及类型的设置
          }
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('export default defineComponent function', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        interface Props {
          msg: string;
          optional?: boolean;
        }
        interface Props2 {
          set: Set<string>;
        }
        export default defineComponent<Props & Props2>((props) => {
          return () => h('div', props.msg);
        })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('export default defineComponent object', async () => {
      const result = await transform(
        `
        import { defineComponent, h } from 'vue';
        interface Props {
          msg: string;
          optional?: boolean;
        }
        interface Props2 {
          set: Set<string>;
        }
        export default defineComponent<Props & Props2>({
        setup(props){
        
        }
        })
        `
      );
      expect(result).toMatchSnapshot();
    });
  });

  describe('runtime emits', () => {
    test('basic', async () => {
      const result = await transform(
        `
        import { type SetupContext, defineComponent } from 'vue';
        defineComponent(
          (
            props,
            { emit }: SetupContext<{ change(val: string): void; click(): void }>
          ) => {
            emit('change');
            return () => {};
          }
        );
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('defineComponent function emit', async () => {
      const result = await transform(
        `
        import { type SetupContext, defineComponent } from 'vue';
        defineComponent<{},{ change(val: string): void; click(): void }>(
          (
            props,
            { emit }
          ) => {
            emit('change');
            return () => {};
          }
        );
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('defineComponent object emit', async () => {
      const result = await transform(
        `
        import { type SetupContext, defineComponent } from 'vue';
        defineComponent<{}>(
          {
            setup(props, {emit}: SetupContext<{ change(val: string): void; click(): void }>) {
              
            }
          }
        );
        
        defineComponent<{},{ change(val: string): void; click(): void }>(
          {
            setup(props, {emit}) {
              
            }
          }
        );
        `
      );
      expect(result).toMatchSnapshot();
    });
  });

  test('w/ tsx', async () => {
    const result = await transform(
      `
      import { type SetupContext, defineComponent } from 'vue';
      defineComponent(() => {
        return () => <div/ >;
      });
      `
    );
    expect(result).toMatchSnapshot();
  });

  describe('defineComponent scope', () => {
    test('fake', async () => {
      const result = await transform(
        `
        const defineComponent = () => {};
        defineComponent((props: { msg?: string }) => {
          return () => <div/ >;
        });
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('w/o import', async () => {
      const result = await transform(
        `
        defineComponent((props: { msg?: string }) => {
          return () => <div/ >;
        });
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('import sub-package', async () => {
      const result = await transform(
        `
        import { defineComponent } from 'vue/dist/vue.esm-bundler';
        defineComponent((props: { msg?: string }) => {
          return () => <div/ >;
        });
        `
      );
      expect(result).toMatchSnapshot();
    });
  });

  describe('infer component name', () => {
    test('no options', async () => {
      const result = await transform(
        `
        import { defineComponent } from 'vue';
        const Foo = defineComponent(() => {})
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('object options', async () => {
      const result = await transform(
        `
        import { defineComponent } from 'vue';
        const Foo = defineComponent(() => {}, { foo: 'bar' })
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('identifier options', async () => {
      const result = await transform(
        `
        import { defineComponent } from 'vue';
        const Foo = defineComponent(() => {}, opts)
        `
      );
      expect(result).toMatchSnapshot();
    });

    test('rest param', async () => {
      const result = await transform(
        `
        import { defineComponent } from 'vue';
        const Foo = defineComponent(() => {}, ...args)
        `
      );
      expect(result).toMatchSnapshot();
    });
  });
});
