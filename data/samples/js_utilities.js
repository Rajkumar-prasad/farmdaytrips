
var home_url="https://www.usdalocalfoodportal.com";
var contributor_link_head=home_url+"/fe/fcontributor";
var claimlisting_link_head=home_url+"/mywp/claimlisting/";
var report_link_head=home_url+"/fe/freport";
var image_path=home_url+"/mywp/uploadimages";

function get_directory_color(directory_type) {
    switch (directory_type) {
        case "agritourism":
              return "#005a31";
            break;
        case "csa":
              return "#458606";
            break;
        case "farmersmarket":
              return "#B95E06";
            break;
        case "foodhub":
              return "#993300";
            break;
        case "onfarmmarket":
              return "#6d3012";
            break;
        default:
             return "#000";
            break;
    }
}

function get_directory_fullname(directory_type) {
    switch (directory_type) {
        case "agritourism":
            return "Agritourism Business";
            break;
        case "csa":
            return "CSA Enterprise";
            break;
        case "farmersmarket":
            return "Farmers Market";
            break;
        case "foodhub":
            return "Food Hub";
            break;
        case "onfarmmarket":
            return "On-farm Market";
            break;
        default:
            return "";
            break;
    }
}

function isEmpty (value) {
    return (
        // null or undefined
        (value == null) ||(value === undefined) || (value === "undefined") ||

        // has length and it's zero
        (value.hasOwnProperty('length') && value.length === 0) ||

        // is an Object and has no keys
        (value.constructor === Object && Object.keys(value).length === 0)
    )
}

function detect_login(api_url) {
    //console.log("detect_login document.cookie=",document.cookie,"\n");
    //console.log("detect_login local storeage token=",localStorage.getItem('token'));
    var cookie;
    if (isEmpty(document.cookie)) {
        //alert("cookie is empty");
        tks=false;
        return false;
    } else {
        var cookies = document.cookie.split(';');
        for (var i in cookies) {
            //console.log(cookies[i]);
            if (cookies[i].trim().startsWith('mytoken=')) {
                cookie=cookies[i].trim();
                break;
            }
        }
        //filter(row => row.startsWith('mytoken='));
        if (isEmpty(cookie)) {
            tks=false;
            //console.log("2\n");
            return false;
        }
        cookie=cookie.split('=')[1];
        if (isEmpty(cookie)) {
            //alert("cookie don't have token");
            tks=false;
            //console.log("3\n");
            return false;
        }
    }
    api_url=api_url.replace("/token/validate/","");
    api_url="mywp/wp-json/jwt-auth/v1";
    //console.log(api_url);
    if (!cookie) {
        return false;
    }
    var result=false;
    try {
        jQuery.ajax({
            method: "POST",
            dataType: "json",
            async: false,
            url:  api_url+"/token/validate/",
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Bearer " + cookie);
            },
            success: function (data) {
                //console.log("\n\nmydata=",data);
                result=true;
            },
        })
            .fail((jqXHR, textstatus, errorThrown) => {
                console.log("submit_signin=\n", jqXHR, errorThrown);
            })
            .done((response) => {

            });
    } catch (err) {
        //alert("<b>Error: </b>Missing token");
        return false;
    }
    return result;
}

function get_user_info(api_url) {
    //console.log("get_user_info detect_login document.cookie=",document.cookie,"\n");
    //console.log("detect_login local storeage token=",localStorage.getItem('token'));
    var cookie;
    var userinfo={"email":"","username":""};
    if (isEmpty(document.cookie)) {
        //alert("cookie is empty");
        tks=false;
        return userinfo;
    } else {
        var cookies = document.cookie.split(';');
        for (var i in cookies) {
            //console.log(cookies[i]);
            if (cookies[i].trim().startsWith('mytoken=')) {
                cookie=cookies[i].trim();
                break;
            }
        }
        //filter(row => row.startsWith('mytoken='));
        if (isEmpty(cookie)) {
            tks=false;
            //console.log("2\n");
            return userinfo;
        }
        cookie=cookie.split('=')[1];
        if (isEmpty(cookie)) {
            //alert("cookie don't have token");
            tks=false;
            //console.log("3\n");
            return userinfo;
        }
    }
    api_url=api_url.replace("/token/getuser/","");
    try {
        jQuery.ajax({
            method: "POST",
            dataType: "json",
            async: false,
            url:  api_url+"/token/getuser/",
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Bearer " + cookie);
            },
            success: function (data) {
                userinfo={"email":data.email,"username":data.username};
                //console.log("data=",data);
                //result=true;
            },
        })
            .fail((jqXHR, textstatus, errorThrown) => {
                console.log("submit_signin=\n", jqXHR, errorThrown);
            })
            .done((response) => {

            });
    } catch (err) {
        //alert("<b>Error: </b>Missing token");
        return userinfo;
    }
    return userinfo;
}

function getQueryParams() {
    function identity (e) { return e; }
    function toKeyValue (params, param) {
        var keyValue = param.split('=');
        var key = keyValue[0], value = keyValue[1];

        params[key] = params[key]?[value].concat(params[key]):value;
        return params;
    }
    return decodeURIComponent(window.location.search).
    replace(/^\?/, '').split('&').
    filter(identity).
    reduce(toKeyValue, {});
}

function setCookie(name,value,days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/"+
        "; domain=usdalocalfoodportal.com; secure=true; SameSite=true;";
}
function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}



function seperate_fulladdress(full_address,googleplace)
{
    var componentForm = {
        street_number: 'short_name', //street number
        route: 'long_name',  //street name
        intersection:'long_name',
        neighborhood:'long_name',
        locality: 'long_name',  //city
        administrative_area_level_2: 'long_name',
        administrative_area_level_1: 'short_name', //state
        country: 'long_name',
        postal_code: 'short_name',
        postal_code_suffix:'short_name',
    };
    var position=googleplace.geometry.location;
    var x=position.lng();
    var y=position.lat();
    var address_components=googleplace.address_components;
    var addlist=full_address.split(",");
    for (var i = 0; i < address_components.length; i++) {
        var addressType = googleplace.address_components[i].types[0];
        if (componentForm[addressType]) {
            var val = googleplace.address_components[i][componentForm[addressType]];
            componentForm[addressType]=val.trim();
        }
    }

    for (var component in componentForm) {
        if (componentForm[component]=="long_name"||componentForm[component]=="short_name") {
            componentForm[component]="";
        }
    }
    var address="";
    if (addlist[0]!==undefined && addlist[0]) {
        address=addlist[0].trim();
    }
    if (componentForm["street_number"]&&componentForm["route"]) {
        address=componentForm["street_number"]+" "+componentForm["route"];
    } else if (componentForm["intersection"]) {
        address=componentForm["intersection"];
    } else {
        address="";
    }
    var city="";
    if (addlist[1]!==undefined && addlist[1]) {
        city=addlist[1].trim();
    }
    if (componentForm["neighborhood"]) {
        var tmp=full_address.split(",");
        // the second is a city
        if (tmp[1].search(componentForm["neighborhood"])>=0) {
            city=componentForm["neighborhood"];
        } else if (componentForm["locality"]){
            city=componentForm["locality"];
        }
    } else if (componentForm["locality"]) {
        city=componentForm["locality"];
    } else {
        city="";
    }

    var county=componentForm["administrative_area_level_2"];
    var zipcode="";
    if (addlist[2]!==undefined && addlist[2]) {
        zipcode = addlist[2].match(/\d/g);
        if (zipcode) {
            zipcode = zipcode.join("");
        }
    }

    if (componentForm["postal_code"]) {
        zipcode=componentForm["postal_code"];
    }
    var zipcode4=componentForm["postal_code_suffix"];
    var state="";
    if (addlist[2]!==undefined && addlist[2]) {
        state = addlist[2].replace("USA", "").replace(zipcode, "").trim();
    }
    if (componentForm["administrative_area_level_1"]) {
        state=componentForm["administrative_area_level_1"];
    }

    return {x:x, y:y,street:address, city:city,county:county,state:state, zipcode:zipcode,zipcode4:zipcode4,};
}


function common_get_nonce() {
    jQuery.ajax({
        url: home_url+'/mywp/wp-json/user/v2/get_nonce',
        method: "GET",
        dataType: "json",
        data: {},
        success: function(data) {
            return data.nonce;
        },
        error: function (error) {
            console.log('get nonce, error=' + JSON.parse(error));
            return "";
        }
    });
}


function common_get_apple_browser_type(){
    //(navigator.userAgent.indexOf('CriOS') != -1) chrome
    //(navigator.userAgent.indexOf('FxiOS') != -1) firefox
    //navigator.userAgent.indexOf('Safari') != -1
    if (navigator.vendor != null && navigator.vendor.match(/Apple Computer, Inc./)) {
        if (navigator.userAgent.match(/iPhone/i)) {
            return "iPhone";
        }
        if (navigator.userAgent.match(/iPad/i)) {
            return "iPad";
        }
        return "Apple";
    } else {
        return "";
    }
}

function common_removeTags(str) {
    if ((str===null) || (str===''))
        return false;
    else
        str = str.toString();
    return str.replace( /(<([^>]+)>)/ig, '');
}




