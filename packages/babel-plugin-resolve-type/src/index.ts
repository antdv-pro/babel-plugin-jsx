import type * as BabelCore from '@babel/core';
import { parseExpression } from '@babel/parser';
import {
  type SimpleTypeResolveContext,
  type SimpleTypeResolveOptions,
  extractRuntimeEmits,
  extractRuntimeProps,
} from '@vue/compiler-sfc';
import { codeFrameColumns } from '@babel/code-frame';
import { addNamed } from '@babel/helper-module-imports';
import { declare } from '@babel/helper-plugin-utils';

export { SimpleTypeResolveOptions as Options };

export default declare<SimpleTypeResolveOptions>(({ types: t }, options) => {
  let ctx: SimpleTypeResolveContext | undefined;
  let helpers: Set<string> | undefined;

  return {
    name: 'babel-plugin-resolve-type',
    pre(file) {
      const filename = file.opts.filename || 'unknown.js';
      helpers = new Set();
      ctx = {
        filename: filename,
        source: file.code,
        options,
        ast: file.ast.program.body,
        isCE: false,
        error(msg, node) {
          throw new Error(
            `[@v-c/babel-plugin-resolve-type] ${msg}\n\n${filename}\n${codeFrameColumns(
              file.code,
              {
                start: {
                  line: node.loc!.start.line,
                  column: node.loc!.start.column + 1,
                },
                end: {
                  line: node.loc!.end.line,
                  column: node.loc!.end.column + 1,
                },
              }
            )}`
          );
        },
        helper(key) {
          helpers!.add(key);
          return `_${key}`;
        },
        getString(node) {
          return file.code.slice(node.start!, node.end!);
        },
        propsTypeDecl: undefined,
        propsRuntimeDefaults: undefined,
        propsDestructuredBindings: {},
        emitsTypeDecl: undefined,
      };
    },
    visitor: {
      CallExpression(path) {
        if (!ctx) {
          throw new Error(
            '[@v-c/babel-plugin-resolve-type] context is not loaded.'
          );
        }

        const { node } = path;

        if (!t.isIdentifier(node.callee, { name: 'defineComponent' })) return;
        if (!checkDefineComponent(path)) return;
        const comp = node.arguments[0];
        let defaultPropsTypeDecl: any | undefined;
        let defaultEmitTypeDecl: any | undefined;
        // 如果类型写在了函数参数上的情况下
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          defaultPropsTypeDecl = node.typeParameters.params[0];
          defaultEmitTypeDecl = node.typeParameters.params[1];
        }
        // 如果不是函数的情况下，判断是不是一个对象
        if (!t.isFunction(comp) && t.isObjectExpression(comp)) {
          // 这种情况下，就不是获取第二个参数了，所以默认情况下就不支持这种模式吧
          defaultEmitTypeDecl = undefined;
          // 判断是否存在了props，如果存在了就不要处理了
          const checkProps = comp.properties.some(
            (p) =>
              t.isObjectProperty(p) &&
              p.key.type === 'Identifier' &&
              p.key.name === 'props'
          );
          // 检查是否存在emits
          const checkEmits = comp.properties.some(
            (p) =>
              t.isObjectProperty(p) &&
              p.key.type === 'Identifier' &&
              p.key.name === 'emits'
          );

          // 获取setup的函数
          const setupFn = comp.properties.find(
            (p) =>
              t.isObjectMethod(p) && t.isIdentifier(p.key, { name: 'setup' })
          );
          if (setupFn && t.isFunction(setupFn)) {
            if (!checkProps) {
              processProps(setupFn, comp, defaultPropsTypeDecl);
            }
            if (!checkEmits) {
              processEmits(setupFn, comp, defaultEmitTypeDecl);
            }
          }
          return;
        }
        if (!comp || !t.isFunction(comp)) return;

        let options = node.arguments[1];
        if (!options) {
          options = t.objectExpression([]);
          node.arguments.push(options);
        }
        node.arguments[1] =
          processProps(comp, options, defaultPropsTypeDecl) || options;
        node.arguments[1] =
          processEmits(comp, node.arguments[1], defaultEmitTypeDecl) || options;
      },
      VariableDeclarator(path) {
        inferComponentName(path);
      },
    },
    post(file) {
      for (const helper of helpers!) {
        addNamed(file.path, `_${helper}`, 'vue');
      }
    },
  };

  function inferComponentName(
    path: BabelCore.NodePath<BabelCore.types.VariableDeclarator>
  ) {
    const id = path.get('id');
    const init = path.get('init');
    if (!id || !id.isIdentifier() || !init || !init.isCallExpression()) return;

    if (!init.get('callee')?.isIdentifier({ name: 'defineComponent' })) return;
    if (!checkDefineComponent(init)) return;

    const nameProperty = t.objectProperty(
      t.identifier('name'),
      t.stringLiteral(id.node.name)
    );
    const { arguments: args } = init.node;
    if (args.length === 0) return;

    if (args.length === 1) {
      init.node.arguments.push(t.objectExpression([]));
    }
    args[1] = addProperty(t, args[1], nameProperty);
  }

  function processProps(
    comp: BabelCore.types.Function,
    options:
      | BabelCore.types.ArgumentPlaceholder
      | BabelCore.types.SpreadElement
      | BabelCore.types.Expression,
    defaultTypeDecl?: any
  ) {
    const props = comp.params[0];
    if (!props) {
      if (defaultTypeDecl) {
        ctx!.propsTypeDecl = defaultTypeDecl;
      }
    } else if (props.type === 'AssignmentPattern') {
      ctx!.propsTypeDecl = getTypeAnnotation(props.left) ?? defaultTypeDecl;
      ctx!.propsRuntimeDefaults = props.right;
    } else {
      ctx!.propsTypeDecl = getTypeAnnotation(props) ?? defaultTypeDecl;
    }

    if (!ctx!.propsTypeDecl) return;

    const runtimeProps = extractRuntimeProps(ctx!);
    if (!runtimeProps) {
      return;
    }

    const ast = parseExpression(runtimeProps);
    return addProperty(
      t,
      options,
      t.objectProperty(t.identifier('props'), ast)
    );
  }

  function addEmit(
    options:
      | BabelCore.types.ArgumentPlaceholder
      | BabelCore.types.SpreadElement
      | BabelCore.types.Expression,
    emitType: any
  ) {
    ctx!.emitsTypeDecl = emitType;
    const runtimeEmits = extractRuntimeEmits(ctx!);

    const ast = t.arrayExpression(
      Array.from(runtimeEmits).map((e) => t.stringLiteral(e))
    );
    return addProperty(
      t,
      options,
      t.objectProperty(t.identifier('emits'), ast)
    );
  }

  function processEmits(
    comp: BabelCore.types.Function,
    options:
      | BabelCore.types.ArgumentPlaceholder
      | BabelCore.types.SpreadElement
      | BabelCore.types.Expression,
    defaultEmitTypeDecl?: any
  ) {
    const setupCtx = comp.params[1] && getTypeAnnotation(comp.params[1]);
    if (
      !setupCtx ||
      !t.isTSTypeReference(setupCtx) ||
      !t.isIdentifier(setupCtx.typeName, { name: 'SetupContext' })
    ) {
      if (defaultEmitTypeDecl) {
        return addEmit(options, defaultEmitTypeDecl);
      }
      return;
    }

    const emitType = setupCtx.typeParameters?.params[0];
    if (!emitType) return;

    return addEmit(options, emitType);
  }
});

function getTypeAnnotation(node: BabelCore.types.Node) {
  if (
    'typeAnnotation' in node &&
    node.typeAnnotation &&
    node.typeAnnotation.type === 'TSTypeAnnotation'
  ) {
    return node.typeAnnotation.typeAnnotation;
  }
}

function checkDefineComponent(
  path: BabelCore.NodePath<BabelCore.types.CallExpression>
) {
  const defineCompImport =
    path.scope.getBinding('defineComponent')?.path.parent;
  if (!defineCompImport) return true;

  return (
    defineCompImport.type === 'ImportDeclaration' &&
    /^@?vue(\/|$)/.test(defineCompImport.source.value)
  );
}

function addProperty<T extends BabelCore.types.Node>(
  t: (typeof BabelCore)['types'],
  object: T,
  property: BabelCore.types.ObjectProperty
) {
  if (t.isObjectExpression(object)) {
    object.properties.unshift(property);
  } else if (t.isExpression(object)) {
    return t.objectExpression([property, t.spreadElement(object)]);
  }
  return object;
}
