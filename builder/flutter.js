const sharp = require("sharp");
const fs = require("fs");
const {
  file,
  resolve,
  find,
  savefile,
  mkdir,
  exists,
  copyFile,
} = require("../tools/file");
const { resizeAndSave, deltaOf } = require("../tools/image");
const { makeios, makeAndroid } = require("./ios");
module.exports = {
  initFlutter,
  makeflutter,
  make,
};

async function initFlutter(flutterProjectPath = process.cwd()) {
  await mkdir(`${flutterProjectPath}/assets`);
  await mkdir(`${flutterProjectPath}/assets/fmaker`);

  let android = `${flutterProjectPath}/assets/fmaker/android_icon.png`;
  let ios = `${flutterProjectPath}/assets/fmaker/ios_icon.png`;
  let img = `${flutterProjectPath}/assets/fmaker/example@3x.png`;

  await copyFile(resolve("../assets/ic_launcher.png"), android);
  await copyFile(resolve("../assets/ios.png"), ios);
  await copyFile(resolve("../assets/example@3x.png"), img);

  console.log(
    `已经增加示例资源:${android},\n${ios},\n${img}\n查看这些文件，最好替换他们,再来试试 fmaker build`,
  );
}

async function makeflutter(flutterProjectPath = process.cwd()) {
  let isFlutter = await exists(`${flutterProjectPath}/pubspec.yaml`);
  if (!isFlutter) {
    console.log(
      `${flutterProjectPath}/pubspec.yaml 不存在`,
      "你必须在flutter目录下运行",
    );
    return false;
  }
  let isInit = await exists(`${flutterProjectPath}/assets/fmaker`);
  if (!isInit) {
    await mkdir(`${flutterProjectPath}/assets`);
    await mkdir(`${flutterProjectPath}/assets/fmaker`);
  }
  let files = await find(`${flutterProjectPath}/assets/fmaker`);
  console.log("读取到文件", files);
  if (files.length == 0) {
    console.log("请先添加文件到fmaker目录");
  }
  var allFileName = [];
  for (const imgPath of files) {
    if (imgPath.indexOf(".png") < 1) {
      continue;
    }

    await make(imgPath, async (imageName, delta, isCheck) => {
      if (imageName == "ios_icon") {
        await makeios(imgPath, `${flutterProjectPath}/ios`);
        return "";
      }
      if (imageName == "android_icon") {
        await makeAndroid(imgPath, `${flutterProjectPath}/android`);
        return "";
      }
      if (delta == 1) {
        if (!isCheck) {
          console.log("创建资源图", imageName);
          allFileName.push(imageName);
        }
        return `${flutterProjectPath}/assets/${imageName}.png`;
      }
      await mkdir(`${flutterProjectPath}/assets/${delta}.0x/`);
      return `${flutterProjectPath}/assets/${delta}.0x/${imageName}.png`;
    });
  }
  console.log("资源目录：", allFileName);

  /// 保存到yaml
  var assetsListString = allFileName
    .map((name) => {
      return `    - assets/${name}.png`;
    })
    .join("\n");
  console.log(assetsListString);
  replaceStringInFile(
    `${flutterProjectPath}/pubspec.yaml`,
    /(# fmaker)[\w\W]*(# fmaker-end)/g,
    "# fmaker\n    # fmaker-end",
  );
  replaceStringInFile(
    `${flutterProjectPath}/pubspec.yaml`,
    "# fmaker",
    "# fmaker\n" + assetsListString,
  );

  /// 保存到r.dart
  await mkdir(`${flutterProjectPath}/lib`);

  var rContentListString = allFileName
    .map((name) => {
      var dartName = toHump(name);
      return `  static final String ${dartName} = 'assets/${name}.png';`;
    })
    .join("\n");
  var rContent = `class R {\n${rContentListString}\n}`;
  fs.writeFileSync(`${flutterProjectPath}/lib/r.dart`, rContent);
}

// 下划线转换驼峰
function toHump(name) {
  return name.replace(/[\_\-\+:\(\)\[\]](\w)/g, function (all, letter) {
    return letter.toUpperCase();
  });
}

function replaceStringInFile(file, target, replace) {
  var content = fs.readFileSync(file, { encoding: "UTF-8" });
  content = content.replace(target, replace);
  fs.writeFileSync(file, content);
}

// 生成一张图片的低倍率版本
async function make(filePath, filePathBuilder) {
  if (!filePathBuilder) {
    // 文件路径创建
    filePathBuilder = async (imageName, delta) => {
      console.log("采用默认生成");
      return `${process.cwd()}/${imageName}@${delta}x.png`;
    };
  }
  // 获取文件名
  let fileName = filePath.substring(
    filePath.lastIndexOf("/") + 1,
    filePath.length,
  );

  let imageName = fileName.replace(/@(\S*)[Xx]/g, "").replace(/\.\S*$/, "");

  // 获取倍率
  let delta = deltaOf(filePath);
  console.log("\n当前图片倍率", delta, imageName);
  console.log("\n开始生成\n");
  let image = sharp(filePath);
  let metadata = await image.metadata();

  //先预先检查一下
  let precheck = await filePathBuilder(imageName, 1, true);
  if (!precheck) {
    return;
  }

  for (let i = delta; i > 0; i--) {
    let size = parseInt((metadata.width / delta) * i);
    let targetPath = await filePathBuilder(imageName, i);
    if (!targetPath) {
      console.log("中断生成");
      return;
    }
    console.log("生成中");
    let info = await resizeAndSave(image, size, targetPath);
    console.log(
      `生成${imageName}的${i}倍图,尺寸：宽:${info.width} 高${info.height}`,
    );
  }
}
